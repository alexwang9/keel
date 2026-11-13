import { withRepair, type ClientFailure, type StructuredRoute } from "@/lib/llm/structured-client";
import { TicketEventSchema, type TicketError, type TicketEvent } from "@/lib/llm/tickets/events";
import type { Spec } from "@/lib/spec/schema";

export type GenerationError = TicketError | ClientFailure;

/** What the UI sees: progress, `repairing` when the automatic retry starts, then one outcome. */
export type GenerationEvent =
  | Exclude<TicketEvent, { type: "invalid" | "error" }>
  | { type: "repairing"; errors: number }
  | { type: "error"; error: GenerationError };

const ROUTE: StructuredRoute<TicketEvent> = {
  path: "/api/tickets/generate",
  schema: TicketEventSchema,
  // A full list at the schema's limits is about 1.5 MB of JSON.
  maxEventChars: 2_000_000,
  copy: {
    invalid_request: "Keel couldn't send this spec. Edit it, approve it again and retry.",
    too_large: "This spec is too large to generate tickets from. Shorten it and try again.",
    protocol: "Ticket generation was interrupted. Try again.",
  },
};

/**
 * Generates tickets for an approved spec. If the first output fails validation, sends it back
 * once with its errors (a second request, so each gets the full function time limit). Every
 * failure ends the sequence with one `error` event; ends quietly when `signal` aborts.
 */
export async function* generateTickets(
  spec: Spec,
  signal?: AbortSignal,
): AsyncGenerator<GenerationEvent> {
  yield* withRepair(ROUTE, { spec }, signal);
}
