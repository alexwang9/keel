import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import { capRepairErrors } from "@/lib/llm/repair";
import { err, ok, type Result } from "@/lib/result";
import { applyProposalOps } from "@/lib/tickets/proposal";
import { ProposalSchema, type ProposalOp, type Ticket } from "@/lib/tickets/schema";
import { formatIssues } from "@/lib/validation";

// Structured outputs need an object at the top level.
export const ImpactOutputSchema = z.object({ ops: ProposalSchema });

/** The output format sent to the API, built like `ticketOutputFormat`. */
export const impactOutputFormat: Anthropic.Beta.BetaJSONOutputFormat = {
  type: "json_schema",
  schema: transformJSONSchema(z.toJSONSchema(ImpactOutputSchema, { io: "input", reused: "ref" })),
};

/** Ids a new ticket may not take: every ticket, dependency and checked ticket id in use. */
function takenIds(tickets: readonly Ticket[], checked: readonly Ticket[]): Set<string> {
  return new Set([...tickets, ...checked].flatMap((ticket) => [ticket.id, ...ticket.dependsOn]));
}

function reusedIdErrors(ops: readonly ProposalOp[], taken: ReadonlySet<string>): string[] {
  return ops.flatMap((op, index) =>
    op.op === "addTicket" && taken.has(op.ticket.id)
      ? [`ops.${String(index)} new ticket ${op.ticket.id} reuses an id already in use`]
      : [],
  );
}

/**
 * Parses the model's proposal for `tickets` (the current list; `checked` is the last checked
 * one). Accepted only if every op applies and, with all of them applied, the list and its
 * dependencies are valid. New tickets may not reuse an id still referenced anywhere, or a
 * dangling dependency would silently start pointing at them. Errors are capped for repair.
 */
export function parseImpactOutput(
  text: string,
  tickets: readonly Ticket[],
  checked: readonly Ticket[],
): Result<ProposalOp[], string[]> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err(capRepairErrors([`output is not valid JSON: ${detail}`]));
  }
  const parsed = ImpactOutputSchema.safeParse(json);
  if (!parsed.success) return err(capRepairErrors(formatIssues(parsed.error.issues)));
  const { ops } = parsed.data;

  const reused = reusedIdErrors(ops, takenIds(tickets, checked));
  if (reused.length > 0) return err(capRepairErrors(reused));
  const applied = applyProposalOps(tickets, ops);
  if (!applied.ok) return err(capRepairErrors(applied.error));
  return ok(ops);
}
