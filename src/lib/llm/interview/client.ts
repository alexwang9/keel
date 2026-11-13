import { InterviewEventSchema, type InterviewEvent } from "@/lib/llm/interview/events";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { MAX_INTERVIEW_BODY_BYTES } from "@/lib/llm/interview/request";
import type { InterviewErrorCode } from "@/lib/llm/interview/events";
import { isAbort, postJson, readSseEvents } from "@/lib/sse-client";
import type { SpecDraft } from "@/lib/spec/schema";

/** Failures the browser detects itself, on top of the ones the server streams. */
export type ClientErrorCode =
  "signed_out" | "invalid_request" | "too_large" | "network" | "protocol";

export interface TurnError {
  code: InterviewErrorCode | ClientErrorCode;
  message: string;
  retryable: boolean;
}

export type TurnEvent =
  Exclude<InterviewEvent, { type: "error" }> | { type: "error"; error: TurnError };

const CLIENT_COPY: Record<ClientErrorCode | "unknown", TurnError> = {
  signed_out: {
    code: "signed_out",
    message: "Your session has ended. Sign in again to continue.",
    retryable: false,
  },
  invalid_request: {
    code: "invalid_request",
    message: "Keel couldn't send this conversation. Start over to continue.",
    retryable: false,
  },
  too_large: {
    code: "too_large",
    message: "This conversation has grown too long to continue. Start over with a shorter brief.",
    retryable: false,
  },
  network: {
    code: "network",
    message: "Couldn't reach Keel. Check your connection and try again.",
    retryable: true,
  },
  protocol: {
    code: "protocol",
    message: "The reply was interrupted. Try again.",
    retryable: true,
  },
  unknown: { code: "unknown", message: "Something went wrong. Try again.", retryable: true },
};

const fail = (code: ClientErrorCode | "unknown"): TurnEvent => ({
  type: "error",
  error: CLIENT_COPY[code],
});

function errorForStatus(status: number): TurnEvent {
  if (status === 401) return fail("signed_out");
  if (status === 413) return fail("too_large");
  if (status === 400) return fail("invalid_request");
  return fail("unknown");
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent, boolean> {
  // A stream that stops anywhere but after a committed turn or the end of the interview lost data.
  let settled = false;
  for await (const event of readSseEvents(body, InterviewEventSchema, MAX_INTERVIEW_BODY_BYTES)) {
    if (!event) return false;
    yield event;
    if (event.type === "error") return true;
    settled = event.type === "turn" || event.type === "complete";
  }
  return settled;
}

/**
 * Sends one interview turn and yields the server's events, each validated. Every failure,
 * including HTTP errors and a stream cut short, ends the sequence with one `error` event.
 * Ends quietly when `signal` aborts.
 */
export async function* sendTurn(
  input: { history: HistoryMessage[]; draft: SpecDraft },
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  let response: Response | null;
  try {
    response = await postJson("/api/interview", input, signal);
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
    const settled = yield* readEvents(response.body);
    if (!settled) yield fail("protocol");
  } catch (error) {
    // A broken connection or an oversized event; either way the turn didn't arrive whole.
    if (!isAbort(error, signal)) yield fail("protocol");
  }
}
