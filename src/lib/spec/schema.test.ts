import { describe, expect, it } from "vitest";
import { SpecDraftSchema, SpecSchema } from "@/lib/spec/schema";
import { formatIssues } from "@/lib/validation";
import { completeDraft } from "@/test/fixtures/spec";

function draftErrors(input: unknown): string[] {
  const parsed = SpecDraftSchema.safeParse(input);
  return parsed.success ? [] : formatIssues(parsed.error.issues);
}

describe("SpecDraftSchema", () => {
  it("accepts an empty draft and the complete fixture", () => {
    expect(draftErrors({})).toEqual([]);
    expect(draftErrors(completeDraft)).toEqual([]);
  });

  it("rejects duplicate ids in a list", () => {
    const question = { id: "Q1", question: "Which regions?" };

    expect(draftErrors({ openQuestions: [question, question] })).toEqual([
      "openQuestions.1.id duplicates id Q1",
    ]);
  });

  it("rejects a none value without a reason", () => {
    expect(draftErrors({ auth: { none: true, reason: "" } })).toEqual([
      "auth.reason must not be empty",
    ]);
  });

  it("rejects unknown project kinds", () => {
    expect(draftErrors({ projectType: { kind: "game", detail: "x" } })).toHaveLength(1);
  });
});

describe("SpecSchema", () => {
  it("parses a complete spec", () => {
    expect(SpecSchema.safeParse(completeDraft).success).toBe(true);
  });

  it("enforces the completeness rules, not just the shape", () => {
    const parsed = SpecSchema.safeParse({
      ...completeDraft,
      openQuestions: [{ id: "Q1", question: "Offline?" }],
    });

    expect(parsed.success || formatIssues(parsed.error.issues)).toEqual([
      "missing openQuestions (1 unresolved)",
    ]);
  });
});
