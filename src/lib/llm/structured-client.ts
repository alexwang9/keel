import type { z } from "zod";
import type { ClientErrorCode } from "@/lib/llm/interview/client";
import type { Repair } from "@/lib/llm/repair";
import { isAbort, postJson, readSseEvents } from "@/lib/sse-client";

// The browser side of an SSE route that makes one structured call per request and may ask, once,
// for a repair (ticket generation and impact checks).

/** A failure the browser detects itself. */
export interface ClientFailure {
  code: ClientErrorCode | "unknown";
  message: string;
  retryable: boolean;
}

type Failure = { type: "error"; error: ClientFailure };
type Invalid = { type: "invalid"; output: string; errors: string[] };
type Repairing = { type: "repairing"; errors: number };

/** What a caller sees: the route's events without `invalid`, plus `repairing` and client errors. */
export type RepairedEvent<E> = Exclude<E, { type: "invalid" }> | Repairing | Failure;

export interface StructuredRoute<E extends { type: string }> {
  path: string;
  schema: z.ZodType<E>;
  maxEventChars: number;
  // Copy for the client failures whose wording depends on what was sent.
  copy: Record<"invalid_request" | "too_large" | "protocol", string>;
}

const SHARED: Record<"signed_out" | "network" | "unknown", string> = {
  signed_out: "Your session has ended. Sign in again to continue.",
  network: "Couldn't reach Keel. Check your connection and try again.",
  unknown: "Something went wrong. Try again.",
};

const RETRYABLE: Record<ClientFailure["code"], boolean> = {
  signed_out: false,
  invalid_request: false,
  too_large: false,
  network: true,
  protocol: true,
  unknown: true,
};

function fail<E extends { type: string }>(
  route: StructuredRoute<E>,
  code: ClientFailure["code"],
): Failure {
  const message = { ...SHARED, ...route.copy }[code];
  return { type: "error", error: { code, message, retryable: RETRYABLE[code] } };
}

function failureForStatus<E extends { type: string }>(
  route: StructuredRoute<E>,
  status: number,
): Failure {
  if (status === 401) return fail(route, "signed_out");
  if (status === 413) return fail(route, "too_large");
  if (status === 400) return fail(route, "invalid_request");
  return fail(route, "unknown");
}

const isOutcome = (event: { type: string }): boolean =>
  event.type === "complete" || event.type === "invalid" || event.type === "error";

const isInvalid = (event: { type: string }): event is Invalid => event.type === "invalid";

/** One request. Ends with exactly one outcome (`complete`, `invalid` or `error`) unless aborted. */
async function* attempt<E extends { type: string }>(
  route: StructuredRoute<E>,
  body: unknown,
  signal: AbortSignal | undefined,
): AsyncGenerator<E | Failure> {
  let response: Response | null;
  try {
    response = await postJson(route.path, body, signal);
  } catch {
    // Aborted by the caller.
    return;
  }
  if (!response) {
    yield fail(route, "network");
    return;
  }
  if (!response.ok || !response.body) {
    yield failureForStatus(route, response.status);
    return;
  }
  try {
    for await (const event of readSseEvents(response.body, route.schema, route.maxEventChars)) {
      if (!event) break;
      yield event;
      if (isOutcome(event)) return;
    }
    yield fail(route, "protocol");
  } catch (error) {
    // A broken connection or an oversized event; either way the result didn't arrive whole.
    if (!isAbort(error, signal)) yield fail(route, "protocol");
  }
}

/**
 * Runs one attempt and passes its events on. Returns the output to repair if the server sent
 * `invalid`, which only a first attempt may do.
 */
async function* relay<E extends { type: string }>(
  route: StructuredRoute<E>,
  body: object,
  isRepair: boolean,
  signal: AbortSignal | undefined,
): AsyncGenerator<RepairedEvent<E>, Repair | null> {
  for await (const event of attempt(route, body, signal)) {
    if (!isInvalid(event)) {
      yield event as RepairedEvent<E>;
      continue;
    }
    if (isRepair) {
      // The server never asks to repair a repair.
      yield fail(route, "protocol");
      return null;
    }
    return { output: event.output, errors: event.errors };
  }
  return null;
}

/**
 * Posts `body`. If the first output fails validation, sends it back once with its errors as
 * `{ ...body, repair }` (a second request, so each gets the full function time limit). Every
 * failure ends the sequence with one `error` event; ends quietly when `signal` aborts.
 */
export async function* withRepair<E extends { type: string }>(
  route: StructuredRoute<E>,
  body: object,
  signal?: AbortSignal,
): AsyncGenerator<RepairedEvent<E>> {
  const repair = yield* relay(route, body, false, signal);
  if (!repair) return;
  yield { type: "repairing", errors: repair.errors.length };
  yield* relay(route, { ...body, repair }, true, signal);
}
