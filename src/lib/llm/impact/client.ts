import { ImpactEventSchema, type ImpactError, type ImpactEvent } from "@/lib/llm/impact/events";
import { withRepair, type ClientFailure, type StructuredRoute } from "@/lib/llm/structured-client";
import type { Spec } from "@/lib/spec/schema";
import type { Ticket } from "@/lib/tickets/schema";

export type ImpactCheckError = ImpactError | ClientFailure;

/** What the UI sees: progress, `repairing` when the automatic retry starts, then one outcome. */
export type ImpactCheckEvent =
  | Exclude<ImpactEvent, { type: "invalid" | "error" }>
  | { type: "repairing"; errors: number }
  | { type: "error"; error: ImpactCheckError };

export interface ImpactInput {
  spec: Spec;
  // The tickets as of the last check, and now.
  checked: readonly Ticket[];
  tickets: readonly Ticket[];
}

const ROUTE: StructuredRoute<ImpactEvent> = {
  path: "/api/tickets/impact",
  schema: ImpactEventSchema,
  // 100 ops, each at most one full ticket, stays under this.
  maxEventChars: 2_000_000,
  copy: {
    invalid_request: "Keel couldn't send these tickets for an impact check. Reload and try again.",
    too_large: "These tickets are too large to check. Shorten some descriptions and try again.",
    protocol: "The impact check was interrupted. Try again.",
  },
};

/**
 * Asks for the changes the user's ticket edits make necessary. If the first proposal fails
 * validation, sends it back once with its errors. Every failure ends the sequence with one
 * `error` event; ends quietly when `signal` aborts.
 */
export async function* checkImpact(
  input: ImpactInput,
  signal?: AbortSignal,
): AsyncGenerator<ImpactCheckEvent> {
  yield* withRepair(ROUTE, input, signal);
}
