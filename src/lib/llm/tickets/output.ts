import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import { capRepairErrors } from "@/lib/llm/repair";
import { err, ok, type Result } from "@/lib/result";
import { formatDagError, topoSort } from "@/lib/tickets/dag";
import { TicketListSchema, type Ticket } from "@/lib/tickets/schema";
import { formatIssues } from "@/lib/validation";

// Structured outputs need an object at the top level.
export const TicketOutputSchema = z.object({ tickets: TicketListSchema });

/**
 * The output format sent to the API. Only `type` and `schema`: with the SDK's `zodOutputFormat`
 * helper the stream would parse the output itself and throw on failure, and we need the issues
 * as data for the repair request. The transform moves length, pattern and size limits the
 * grammar can't express into descriptions, so `parseTicketOutput` still enforces them.
 */
export const ticketOutputFormat: Anthropic.Beta.BetaJSONOutputFormat = {
  type: "json_schema",
  schema: transformJSONSchema(z.toJSONSchema(TicketOutputSchema, { io: "input", reused: "ref" })),
};

/**
 * Parses the model's JSON into tickets in topological order. Fails with readable errors (schema
 * issues, then dependency graph errors) capped to what a repair request accepts.
 */
export function parseTicketOutput(text: string): Result<Ticket[], string[]> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err(capRepairErrors([`output is not valid JSON: ${detail}`]));
  }
  const parsed = TicketOutputSchema.safeParse(json);
  if (!parsed.success) return err(capRepairErrors(formatIssues(parsed.error.issues)));
  const sorted = topoSort(parsed.data.tickets);
  if (!sorted.ok) return err(capRepairErrors(sorted.error.map(formatDagError)));
  return ok(sorted.value);
}

const TICKET_ID = /"id"\s*:\s*"T\d+"/g;

/**
 * Counts ticket ids in streamed JSON as it grows. Only tickets have an `id` key (dependencies
 * are plain strings), so this tracks how many tickets the model has started. Resumes from the
 * last match, so each call rescans at most the tail since then.
 */
export function ticketCounter(): (text: string) => number {
  let count = 0;
  let position = 0;
  return (text) => {
    TICKET_ID.lastIndex = position;
    while (TICKET_ID.exec(text) !== null) {
      count++;
      position = TICKET_ID.lastIndex;
    }
    return count;
  };
}
