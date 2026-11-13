import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  codeForError,
  impactError,
  interviewError,
  requestIdOf,
  ticketError,
} from "@/lib/llm/errors";
import { IMPACT_ERROR_CODES } from "@/lib/llm/impact/events";
import { INTERVIEW_ERROR_CODES } from "@/lib/llm/interview/events";
import { TICKET_ERROR_CODES } from "@/lib/llm/tickets/events";

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

  it("maps an exhausted credit balance to billing, whatever the status or type", () => {
    const lowCredit = Anthropic.APIError.generate(
      400,
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is too low to access the Anthropic API.",
        },
      },
      undefined,
      headers,
    );

    expect(codeForError(lowCredit)).toBe("billing");
    expect(codeForError(statusError(402, "billing_error"))).toBe("billing");
    expect(codeForError(statusError(400, "invalid_request_error"))).toBe("bad_request");
  });

  it("maps connection errors and timeouts to connection", () => {
    expect(codeForError(new Anthropic.APIConnectionError({ message: "down" }))).toBe("connection");
    expect(codeForError(new Anthropic.APIConnectionTimeoutError())).toBe("connection");
  });

  it.each([
    ["overloaded_error", "overloaded"],
    ["rate_limit_error", "rate_limited"],
    ["invalid_request_error", "bad_request"],
    ["billing_error", "billing"],
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
    expect(interviewError("billing").retryable).toBe(false);
  });
});

describe("ticketError", () => {
  it.each(TICKET_ERROR_CODES)("has friendly copy for %s", (code) => {
    const error = ticketError(code);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.message).not.toMatch(/anthropic|api|429|500/i);
  });

  it("lets the user retry a failed repair or a timeout, but not a refusal", () => {
    expect(ticketError("invalid_output").retryable).toBe(true);
    expect(ticketError("timeout").retryable).toBe(true);
    expect(ticketError("refusal").retryable).toBe(false);
  });
});

describe("impactError", () => {
  it.each(IMPACT_ERROR_CODES)("has friendly copy for %s", (code) => {
    const error = impactError(code);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.message).not.toMatch(/anthropic|api|429|500/i);
  });
});

describe("requestIdOf", () => {
  it("returns the API request id when there is one", () => {
    expect(requestIdOf(statusError(429, "rate_limit_error"))).toBe("req_123");
    expect(requestIdOf(new Error("boom"))).toBeUndefined();
  });
});
