import { describe, expect, it } from "vitest";
import { MAX_INTERVIEW_BODY_BYTES, parseInterviewRequest } from "@/lib/llm/interview/request";

const valid = { history: [{ role: "user", content: "Hi" }], draft: { name: "Shelf" } };

describe("parseInterviewRequest", () => {
  it("accepts a history and a draft", () => {
    expect(parseInterviewRequest(JSON.stringify(valid))).toEqual({ ok: true, value: valid });
  });

  it("rejects a body that isn't JSON", () => {
    expect(parseInterviewRequest("{nope")).toEqual({
      ok: false,
      error: { status: 400, errors: ["request body is not valid JSON"] },
    });
  });

  it("rejects an invalid draft or history with the paths at fault", () => {
    const result = parseInterviewRequest(
      JSON.stringify({ history: [], draft: { projectType: { kind: "game" } } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(result.error.errors.some((error) => error.startsWith("history"))).toBe(true);
    expect(result.error.errors.some((error) => error.startsWith("draft.projectType"))).toBe(true);
  });

  it("rejects a missing draft", () => {
    const result = parseInterviewRequest(JSON.stringify({ history: valid.history }));
    expect(result).toMatchObject({ ok: false, error: { status: 400 } });
  });

  it("rejects an oversized body before parsing it", () => {
    const body = JSON.stringify({ ...valid, padding: "x".repeat(MAX_INTERVIEW_BODY_BYTES) });
    expect(parseInterviewRequest(body)).toMatchObject({ ok: false, error: { status: 413 } });
  });
});
