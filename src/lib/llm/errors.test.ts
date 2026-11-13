import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { codeForError, interviewError, requestIdOf } from "@/lib/llm/errors";
import { INTERVIEW_ERROR_CODES } from "@/lib/llm/interview/events";

const headers = new Headers({ "request-id": "req_123" });
const body = (type: string) => ({ type: "error", error: { type, message: "detail" } });
const statusError = (status: number, type: string) =>
  Anthropic.APIError.generate(status, body(type), undefined, headers);

describe("codeForError", () => {
  it.each([
    [429, "rate_limit_error", "rate_limited"],
    [401, "authentication_error", "server_config"],
    [403, "permission_error", "server_config"],
    [404, "not_found_error", "server_config"],
    [400, "invalid_request_error", "bad_request"],
    [500, "api_error", "overloaded"],
    [529, "overloaded_error", "overloaded"],
  ] as const)("maps HTTP %i to %s", (status, type, code) => {
    expect(codeForError(statusError(status, type))).toBe(code);
  });

  it("maps connection errors and timeouts to connection", () => {
    expect(codeForError(new Anthropic.APIConnectionError({ message: "down" }))).toBe("connection");
    expect(codeForError(new Anthropic.APIConnectionTimeoutError())).toBe("connection");
  });

  it.each([
    ["overloaded_error", "overloaded"],
    ["rate_limit_error", "rate_limited"],
    ["invalid_request_error", "bad_request"],
    ["something_new", "unknown"],
  ] as const)("maps a mid-stream %s event to %s", (type, code) => {
    // Cast: the SDK's ErrorType is closed, but the API may send types newer than this SDK knows.
    const errorType = type as ConstructorParameters<typeof Anthropic.APIError>[4];
    const error = new Anthropic.APIError(undefined, body(type), undefined, headers, errorType);
    expect(codeForError(error)).toBe(code);
  });

  it("maps anything else to unknown", () => {
    expect(codeForError(new Error("boom"))).toBe("unknown");
    expect(codeForError("boom")).toBe("unknown");
  });
});

describe("interviewError", () => {
  it.each(INTERVIEW_ERROR_CODES)("has friendly copy for %s", (code) => {
    const error = interviewError(code);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.message).not.toMatch(/anthropic|api|429|500/i);
  });

  it("marks transient failures as retryable and the rest as not", () => {
    expect(interviewError("rate_limited").retryable).toBe(true);
    expect(interviewError("connection").retryable).toBe(true);
    expect(interviewError("refusal").retryable).toBe(false);
    expect(interviewError("server_config").retryable).toBe(false);
  });
});

describe("requestIdOf", () => {
  it("returns the API request id when there is one", () => {
    expect(requestIdOf(statusError(429, "rate_limit_error"))).toBe("req_123");
    expect(requestIdOf(new Error("boom"))).toBeUndefined();
  });
});
