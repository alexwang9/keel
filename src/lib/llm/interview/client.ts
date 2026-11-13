import { EventSourceParserStream, type EventSourceMessage } from "eventsource-parser/stream";
import { InterviewEventSchema, type InterviewEvent } from "@/lib/llm/interview/events";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { MAX_INTERVIEW_BODY_BYTES } from "@/lib/llm/interview/request";
import type { InterviewErrorCode } from "@/lib/llm/interview/events";
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

function parseEvent(message: EventSourceMessage): InterviewEvent | null {
  try {
    const parsed = InterviewEventSchema.safeParse(JSON.parse(message.data));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON: treated like any other malformed event by the caller.
    return null;
  }
}

const isAbort = (error: unknown, signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent, boolean> {
  const reader = body
    // It accepts any BufferSource; TS's lib types can't see that this covers Uint8Array.
    .pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
    .pipeThrough(new EventSourceParserStream({ maxBufferSize: MAX_INTERVIEW_BODY_BYTES }))
    .getReader();
  // A stream that stops anywhere but after a committed turn or the end of the interview lost data.
  let settled = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return settled;
      const event = parseEvent(value);
      if (!event) return false;
      yield event;
      if (event.type === "error") return true;
      settled = event.type === "turn" || event.type === "complete";
    }
  } finally {
    // Cancelling an already-finished reader can reject; there is nothing left to clean up then.
    await reader.cancel().catch(() => undefined);
  }
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
  let response: Response;
  try {
    response = await fetch("/api/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (!isAbort(error, signal)) yield fail("network");
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
