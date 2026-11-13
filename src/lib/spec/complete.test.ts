import { describe, expect, it } from "vitest";
import { isSpecComplete } from "@/lib/spec/complete";
import type { SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

function without(draft: SpecDraft, ...fields: (keyof SpecDraft)[]): SpecDraft {
  return Object.fromEntries(
    Object.entries(draft).filter(([key]) => !fields.includes(key as keyof SpecDraft)),
  );
}

function missingFor(draft: SpecDraft): string[] {
  const result = isSpecComplete(draft);
  if (result.complete) throw new Error("expected the draft to be incomplete");
  return result.missing;
}

describe("isSpecComplete", () => {
  it("accepts a complete draft and returns the spec", () => {
    const result = isSpecComplete(completeDraft);

    expect(result).toEqual({ complete: true, spec: completeDraft });
  });

  it("lists every unanswered field of an empty draft, in template order", () => {
    expect(missingFor({})).toEqual([
      "name",
      "problem",
      "goal",
      "targetUsers",
      "projectType",
      "features (none yet)",
      "dataModel",
      "integrations",
      "auth",
      "deploymentTarget",
    ]);
  });

  it.each([
    "name",
    "problem",
    "goal",
    "targetUsers",
    "projectType",
    "dataModel",
    "integrations",
    "auth",
    "deploymentTarget",
  ] as const)("reports %s when unanswered", (field) => {
    expect(missingFor(without(completeDraft, field))).toEqual([field]);
  });

  it("requires at least one feature", () => {
    expect(missingFor({ ...completeDraft, features: [] })).toEqual(["features (none yet)"]);
  });

  it("requires an acceptance check on every feature", () => {
    const [first, second] = completeDraft.features;
    if (!first || !second) throw new Error("fixture needs two features");
    const draft = { ...completeDraft, features: [first, { ...second, acceptanceChecks: [] }] };

    expect(missingFor(draft)).toEqual([`features[${second.id}].acceptanceChecks`]);
  });

  it("requires entities unless the data model is explicitly none", () => {
    const empty: SpecDraft["dataModel"] = { none: false, entities: [], relationships: [] };

    expect(missingFor({ ...completeDraft, dataModel: empty })).toEqual([
      "dataModel.entities (none yet)",
    ]);
    expect(
      isSpecComplete({ ...completeDraft, dataModel: { none: true, reason: "Stateless CLI" } })
        .complete,
    ).toBe(true);
  });

  it("requires integration items unless integrations are explicitly none", () => {
    const draft: SpecDraft = { ...completeDraft, integrations: { none: false, items: [] } };

    expect(missingFor(draft)).toEqual(["integrations.items (none yet)"]);
  });

  it("accepts auth either described or explicitly none", () => {
    const described: SpecDraft["auth"] = { none: false, description: "GitHub sign-in" };

    expect(isSpecComplete({ ...completeDraft, auth: described }).complete).toBe(true);
  });

  it("requires open questions to be resolved", () => {
    const draft = {
      ...completeDraft,
      openQuestions: [
        { id: "Q1", question: "Which regions?" },
        { id: "Q2", question: "Offline support?" },
      ],
    };

    expect(missingFor(draft)).toEqual(["openQuestions (2 unresolved)"]);
  });

  it("treats unanswered outOfScope, constraints and openQuestions as empty", () => {
    const result = isSpecComplete(
      without(completeDraft, "outOfScope", "constraints", "openQuestions"),
    );

    expect(result.complete && result.spec).toMatchObject({
      outOfScope: [],
      constraints: [],
      openQuestions: [],
    });
  });
});
