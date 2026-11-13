import Anthropic from "@anthropic-ai/sdk";
import type { LlmErrorCode } from "@/lib/llm/error-codes";
import type { ImpactError, ImpactErrorCode } from "@/lib/llm/impact/events";
import type { InterviewError, InterviewErrorCode } from "@/lib/llm/interview/events";
import type { TicketError, TicketErrorCode } from "@/lib/llm/tickets/events";

interface Copy {
  message: string;
  retryable: boolean;
}

// Copy that reads the same whichever task failed.
const SHARED_COPY: Record<Exclude<LlmErrorCode, "bad_request" | "refusal" | "max_tokens">, Copy> = {
  rate_limited: {
    message: "Too many requests right now. Wait a moment and try again.",
    retryable: true,
  },
  overloaded: { message: "The AI service is busy. Try again in a moment.", retryable: true },
  connection: {
    message: "Couldn't reach the AI service. Check your connection and try again.",
    retryable: true,
  },
  server_config: {
    message: "Keel isn't set up correctly. The owner has been told.",
    retryable: false,
  },
  billing: {
    message: "Keel's AI budget has run out. The owner needs to top it up before you can continue.",
    retryable: false,
  },
  unknown: { message: "Something went wrong. Try again.", retryable: true },
};

const INTERVIEW_COPY: Record<InterviewErrorCode, Copy> = {
  ...SHARED_COPY,
  bad_request: {
    message: "Something went wrong with this conversation. Try again, or start over.",
    retryable: false,
  },
  refusal: {
    message: "The assistant couldn't help with that. Try rephrasing your message.",
    retryable: false,
  },
  max_tokens: { message: "The reply was cut off. Try again.", retryable: true },
  loop_limit: { message: "The assistant got stuck updating the spec. Try again.", retryable: true },
};

const TICKET_COPY: Record<TicketErrorCode, Copy> = {
  ...SHARED_COPY,
  bad_request: {
    message: "Keel couldn't send this spec for ticket generation. Try again, or edit the spec.",
    retryable: false,
  },
  refusal: {
    message: "The assistant couldn't break this spec into tickets. Try editing the spec.",
    retryable: false,
  },
  max_tokens: {
    message: "The ticket list was too long to finish. Try again, or narrow the spec.",
    retryable: true,
  },
  invalid_output: {
    message: "The generated tickets had problems Keel couldn't fix. Try generating again.",
    retryable: true,
  },
  timeout: {
    message: "Generating tickets took too long. Try again, or narrow the spec.",
    retryable: true,
  },
};

const IMPACT_COPY: Record<ImpactErrorCode, Copy> = {
  ...SHARED_COPY,
  bad_request: {
    message: "Keel couldn't send these tickets for an impact check. Try again.",
    retryable: false,
  },
  refusal: {
    message: "The assistant couldn't check these edits. Try changing them.",
    retryable: false,
  },
  max_tokens: { message: "The proposal was too long to finish. Try again.", retryable: true },
  invalid_output: {
    message: "The proposed changes had problems Keel couldn't fix. Try checking again.",
    retryable: true,
  },
  timeout: { message: "The impact check took too long. Try again.", retryable: true },
};

export const interviewError = (code: InterviewErrorCode): InterviewError => ({
  code,
  ...INTERVIEW_COPY[code],
});

export const ticketError = (code: TicketErrorCode): TicketError => ({
  code,
  ...TICKET_COPY[code],
});

export const impactError = (code: ImpactErrorCode): ImpactError => ({
  code,
  ...IMPACT_COPY[code],
});

/** Mid-stream errors arrive as an SSE `error` event with no HTTP status, only an error type. */
function codeForType(type: string | null): LlmErrorCode {
  switch (type) {
    case "rate_limit_error":
      return "rate_limited";
    case "overloaded_error":
    case "api_error":
      return "overloaded";
    case "billing_error":
      return "billing";
    case "invalid_request_error":
      return "bad_request";
    default:
      return "unknown";
  }
}

// An exhausted credit balance has arrived as a 400 `invalid_request_error`, not `billing_error`.
const BILLING_MESSAGE = /credit balance is too low/i;

const isBilling = (error: { type: string | null; message: string }): boolean =>
  error.type === "billing_error" || BILLING_MESSAGE.test(error.message);

/** Maps an error thrown by the SDK to an error code, most specific class first. */
export function codeForError(error: unknown): LlmErrorCode {
  // Before the class checks: billing failures come back under more than one status.
  if (error instanceof Anthropic.APIError && isBilling(error)) return "billing";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError) return "server_config";
  if (error instanceof Anthropic.PermissionDeniedError) return "server_config";
  if (error instanceof Anthropic.NotFoundError) return "server_config";
  if (error instanceof Anthropic.BadRequestError) return "bad_request";
  if (error instanceof Anthropic.InternalServerError) return "overloaded";
  // Before APIError: connection errors (including timeouts) are a subclass.
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (error instanceof Anthropic.APIError) return codeForType(error.type);
  return "unknown";
}

/** The request id to log alongside an error, when the API returned one. */
export function requestIdOf(error: unknown): string | undefined {
  return error instanceof Anthropic.APIError ? (error.requestID ?? undefined) : undefined;
}
