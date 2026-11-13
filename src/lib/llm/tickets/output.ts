import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import { MAX_REPAIR_ERRORS } from "@/lib/llm/tickets/events";
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

const MAX_ERROR_CHARS = 1000;

/** Fits errors into a repair request: each one shortened, and any beyond the cap summarised. */
function capped(errors: readonly string[]): string[] {
  const clipped = errors.map((error) => error.slice(0, MAX_ERROR_CHARS));
  if (clipped.length <= MAX_REPAIR_ERRORS) return clipped;
  const kept = clipped.slice(0, MAX_REPAIR_ERRORS - 1);
  return [...kept, `…and ${String(clipped.length - kept.length)} more problems`];
}

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
    return err(capped([`output is not valid JSON: ${detail}`]));
  }
  const parsed = TicketOutputSchema.safeParse(json);
  if (!parsed.success) return err(capped(formatIssues(parsed.error.issues)));
  const sorted = topoSort(parsed.data.tickets);
  if (!sorted.ok) return err(capped(sorted.error.map(formatDagError)));
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
