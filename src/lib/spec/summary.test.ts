import { describe, expect, it } from "vitest";
import type { SpecDraft } from "@/lib/spec/schema";
import { summarizeDraft, type FieldSummary } from "@/lib/spec/summary";
import { completeDraft } from "@/test/fixtures/spec";

const field = (draft: SpecDraft, key: FieldSummary["key"]): FieldSummary => {
  const found = summarizeDraft(draft).find((row) => row.key === key);
  if (!found) throw new Error(`no row for ${key}`);
  return found;
};

describe("summarizeDraft", () => {
  it("lists every template field in order", () => {
    expect(summarizeDraft({}).map((row) => row.key)).toEqual([
      "name",
      "problem",
      "goal",
      "targetUsers",
      "projectType",
      "features",
      "outOfScope",
      "dataModel",
      "integrations",
      "auth",
      "deploymentTarget",
      "constraints",
    ]);
  });

  it("marks required fields missing and list-only fields optional on an empty draft", () => {
    const statuses = Object.fromEntries(summarizeDraft({}).map((row) => [row.key, row.status]));

    expect(statuses).toMatchObject({ name: "missing", features: "missing", auth: "missing" });
    expect(statuses).toMatchObject({ outOfScope: "optional", constraints: "optional" });
  });

  it("marks every field filled on a complete draft", () => {
    expect(summarizeDraft(completeDraft).every((row) => row.status === "filled")).toBe(true);
  });

  it("previews values, including explicit none", () => {
    expect(field(completeDraft, "name").preview).toBe("Shelf");
    expect(field(completeDraft, "projectType").preview).toBe(
      "web-app: Responsive web app, mobile-first.",
    );
    expect(field(completeDraft, "features").preview).toBe(
      "Shared reading list, Vote on the next book",
    );
    expect(field(completeDraft, "auth").preview).toMatch(/^None: Clubs share/);
    expect(field({ outOfScope: [] }, "outOfScope")).toMatchObject({
      status: "filled",
      preview: "None",
    });
  });

  it("flags features that still need acceptance checks", () => {
    const draft: SpecDraft = {
      features: [{ id: "F1", title: "Login", description: "Sign in.", acceptanceChecks: [] }],
    };

    expect(field(draft, "features")).toEqual({
      key: "features",
      label: "Features",
      status: "incomplete",
      preview: "Needs acceptance checks: Login",
    });
  });

  it("flags a data model or integration list that was started but is empty", () => {
    const draft: SpecDraft = {
      dataModel: { none: false, entities: [], relationships: [] },
      integrations: { none: false, items: [] },
    };

    expect(field(draft, "dataModel").status).toBe("incomplete");
    expect(field(draft, "integrations").status).toBe("incomplete");
  });

  it("clips long previews", () => {
    const preview = field({ problem: "x".repeat(500) }, "problem").preview;

    expect(preview).toHaveLength(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});
