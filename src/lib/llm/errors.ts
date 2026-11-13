import Anthropic from "@anthropic-ai/sdk";
import type { InterviewError, InterviewErrorCode } from "@/lib/llm/interview/events";

const COPY: Record<InterviewErrorCode, { message: string; retryable: boolean }> = {
  rate_limited: {
    message: "Too many requests right now. Wait a moment and try again.",
    retryable: true,
  },
  overloaded: { message: "The AI service is busy. Try again in a moment.", retryable: true },
  connection: {
    message: "Couldn't reach the AI service. Check your connection and try again.",
    retryable: true,
  },
  bad_request: {
    message: "Something went wrong with this conversation. Try again, or start over.",
    retryable: false,
  },
  server_config: {
    message: "Keel isn't set up correctly. The owner has been told.",
    retryable: false,
  },
  refusal: {
    message: "The assistant couldn't help with that. Try rephrasing your message.",
    retryable: false,
  },
  max_tokens: { message: "The reply was cut off. Try again.", retryable: true },
  loop_limit: { message: "The assistant got stuck updating the spec. Try again.", retryable: true },
  unknown: { message: "Something went wrong. Try again.", retryable: true },
};

export const interviewError = (code: InterviewErrorCode): InterviewError => ({
  code,
  ...COPY[code],
});

/** Mid-stream errors arrive as an SSE `error` event with no HTTP status, only an error type. */
function codeForType(type: string | null): InterviewErrorCode {
  switch (type) {
    case "rate_limit_error":
      return "rate_limited";
    case "overloaded_error":
    case "api_error":
      return "overloaded";
    case "invalid_request_error":
      return "bad_request";
    default:
      return "unknown";
  }
}

/** Maps an error thrown by the SDK to an interview error code, most specific class first. */
export function codeForError(error: unknown): InterviewErrorCode {
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
