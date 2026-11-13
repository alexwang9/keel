import type { ClientErrorCode } from "@/lib/llm/interview/client";
import {
  TicketEventSchema,
  type Repair,
  type TicketErrorCode,
  type TicketEvent,
} from "@/lib/llm/tickets/events";
import type { TicketRequest } from "@/lib/llm/tickets/request";
import { isAbort, postJson, readSseEvents } from "@/lib/sse-client";
import type { Spec } from "@/lib/spec/schema";

// A full list at the schema's limits is about 1.5 MB of JSON.
const MAX_EVENT_CHARS = 2_000_000;

export interface GenerationError {
  code: TicketErrorCode | ClientErrorCode;
  message: string;
  retryable: boolean;
}

/** What the UI sees: progress, `repairing` when the automatic retry starts, then one outcome. */
export type GenerationEvent =
  | Exclude<TicketEvent, { type: "invalid" | "error" }>
  | { type: "repairing"; errors: number }
  | { type: "error"; error: GenerationError };

type AttemptEvent =
  Exclude<TicketEvent, { type: "error" }> | { type: "error"; error: GenerationError };

const CLIENT_COPY: Record<ClientErrorCode, GenerationError> = {
  signed_out: {
    code: "signed_out",
    message: "Your session has ended. Sign in again to continue.",
    retryable: false,
  },
  invalid_request: {
    code: "invalid_request",
    message: "Keel couldn't send this spec. Edit it, approve it again and retry.",
    retryable: false,
  },
  too_large: {
    code: "too_large",
    message: "This spec is too large to generate tickets from. Shorten it and try again.",
    retryable: false,
  },
  network: {
    code: "network",
    message: "Couldn't reach Keel. Check your connection and try again.",
    retryable: true,
  },
  protocol: {
    code: "protocol",
    message: "Ticket generation was interrupted. Try again.",
    retryable: true,
  },
};

const UNKNOWN: GenerationError = {
  code: "unknown",
  message: "Something went wrong. Try again.",
  retryable: true,
};

const fail = (code: ClientErrorCode): { type: "error"; error: GenerationError } => ({
  type: "error",
  error: CLIENT_COPY[code],
});

function errorForStatus(status: number): { type: "error"; error: GenerationError } {
  if (status === 401) return fail("signed_out");
  if (status === 413) return fail("too_large");
  if (status === 400) return fail("invalid_request");
  return { type: "error", error: UNKNOWN };
}

const isOutcome = (event: TicketEvent): boolean =>
  event.type === "complete" || event.type === "invalid" || event.type === "error";

/** One request. Ends with exactly one outcome (`complete`, `invalid` or `error`) unless aborted. */
async function* attempt(input: TicketRequest, signal?: AbortSignal): AsyncGenerator<AttemptEvent> {
  let response: Response | null;
  try {
    response = await postJson("/api/tickets/generate", input, signal);
  } catch {
    // Aborted by the caller.
    return;
  }
  if (!response) {
    yield fail("network");
    return;
  }
  if (!response.ok || !response.body) {
    yield errorForStatus(response.status);
    return;
  }
  try {
    for await (const event of readSseEvents(response.body, TicketEventSchema, MAX_EVENT_CHARS)) {
      if (!event) break;
      yield event;
      if (isOutcome(event)) return;
    }
    yield fail("protocol");
  } catch (error) {
    // A broken connection or an oversized event; either way the result didn't arrive whole.
    if (!isAbort(error, signal)) yield fail("protocol");
  }
}

/**
 * Runs one attempt and passes its events on. Returns the output to repair if the server sent
 * `invalid`, which only a first attempt may do.
 */
async function* relay(
  input: TicketRequest,
  signal: AbortSignal | undefined,
): AsyncGenerator<GenerationEvent, Repair | null> {
  for await (const event of attempt(input, signal)) {
    if (event.type !== "invalid") {
      yield event;
      continue;
    }
    if (input.repair) {
      // The server never asks to repair a repair.
      yield fail("protocol");
      return null;
    }
    return { output: event.output, errors: event.errors };
  }
  return null;
}

/**
 * Generates tickets for an approved spec. If the first output fails validation, sends it back
 * once with its errors (a second request, so each gets the full function time limit). Every
 * failure ends the sequence with one `error` event; ends quietly when `signal` aborts.
 */
export async function* generateTickets(
  spec: Spec,
  signal?: AbortSignal,
): AsyncGenerator<GenerationEvent> {
  const repair = yield* relay({ spec }, signal);
  if (!repair) return;
  yield { type: "repairing", errors: repair.errors.length };
  yield* relay({ spec, repair }, signal);
}
