import {
  CreateEventSchema,
  type CreateError,
  type CreateEvent,
  type CreateStep,
} from "@/lib/github/events";
import { NameCheckSchema, type NameCheck } from "@/lib/github/repo-name";
import type { CreateRequest } from "@/lib/github/request";
import type { ClientErrorCode } from "@/lib/llm/interview/client";
import { err, ok, type Result } from "@/lib/result";
import { isAbort, postJson, readSseEvents } from "@/lib/sse-client";

// The browser side of the GitHub routes.

/** A failure the browser detects itself, or the stream's own error. */
export interface CreateRunError {
  code: CreateError["code"] | ClientErrorCode | "unknown";
  message: string;
  retryable: boolean;
  step?: CreateStep;
}

const COPY: Record<ClientErrorCode | "unknown", Omit<CreateRunError, "code">> = {
  signed_out: { message: "Your session has ended. Sign in again, then resume.", retryable: false },
  invalid_request: {
    message: "Keel couldn't send these tickets to GitHub. Reload the page and try again.",
    retryable: false,
  },
  too_large: {
    message: "This project is too large to send in one request. Shorten some tickets.",
    retryable: false,
  },
  network: { message: "Couldn't reach Keel. Check your connection, then resume.", retryable: true },
  protocol: { message: "Creation was interrupted. Resume to carry on.", retryable: true },
  unknown: { message: "Something went wrong. Resume to try again.", retryable: true },
};

const failure = (code: ClientErrorCode | "unknown"): CreateRunError => ({ code, ...COPY[code] });

const failureForStatus = (status: number): CreateRunError => {
  if (status === 401) return failure("signed_out");
  if (status === 413) return failure("too_large");
  if (status === 400) return failure("invalid_request");
  return failure("unknown");
};

/** What one create request yields: the route's events, with client failures as `error`. */
export type CreateRunEvent =
  Exclude<CreateEvent, { type: "error" }> | { type: "error"; error: CreateRunError };

// The largest event is an error with its copy; anything near this is malformed.
const MAX_EVENT_CHARS = 100_000;

const isOutcome = (event: CreateEvent): boolean =>
  event.type === "complete" || event.type === "paused" || event.type === "error";

/**
 * Sends one create request and yields its events. Ends with exactly one outcome (`complete`,
 * `paused` or `error`), or quietly when `signal` aborts.
 */
export async function* sendCreate(
  body: CreateRequest,
  signal?: AbortSignal,
): AsyncGenerator<CreateRunEvent> {
  let response: Response | null;
  try {
    response = await postJson("/api/github/create", body, signal);
  } catch {
    return;
  }
  if (!response) {
    yield { type: "error", error: failure("network") };
    return;
  }
  if (!response.ok || !response.body) {
    yield { type: "error", error: failureForStatus(response.status) };
    return;
  }
  try {
    for await (const event of readSseEvents(response.body, CreateEventSchema, MAX_EVENT_CHARS)) {
      if (event === null) break;
      yield event;
      if (isOutcome(event)) return;
    }
  } catch (error) {
    if (isAbort(error, signal)) return;
  }
  if (signal?.aborted) return;
  yield { type: "error", error: failure("protocol") };
}

const NAME_CHECK_COPY = {
  signed_out: "Your session has ended. Sign in again to continue.",
  failed: "Keel couldn't check that name with GitHub. Try again.",
} as const;

/** Asks whether the name is free. Failures come back as friendly text. */
export async function checkRepoName(
  name: string,
  signal?: AbortSignal,
): Promise<Result<NameCheck, string>> {
  try {
    const response = await fetch(`/api/github/repo-name?name=${encodeURIComponent(name)}`, {
      signal,
    });
    if (response.status === 401) return err(NAME_CHECK_COPY.signed_out);
    if (!response.ok) return err(NAME_CHECK_COPY.failed);
    const parsed = NameCheckSchema.safeParse(await response.json());
    return parsed.success ? ok(parsed.data) : err(NAME_CHECK_COPY.failed);
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return err(NAME_CHECK_COPY.failed);
  }
}
