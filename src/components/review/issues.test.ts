import { describe, expect, it } from "vitest";
import { issuesFor } from "@/components/review/issues";
import { FeatureSchema, ProjectTypeSchema } from "@/lib/spec/schema";

describe("issuesFor", () => {
  it("returns nothing for a valid value", () => {
    expect(
      issuesFor(ProjectTypeSchema, { kind: "cli", detail: "A tool." }, "Project type"),
    ).toEqual([]);
  });

  it("names the field and counts list positions from 1", () => {
    const feature = { id: "F1", title: " ", description: "x", acceptanceChecks: ["ok", ""] };

    expect(
      issuesFor(FeatureSchema, feature, "feature", { acceptanceChecks: "acceptance check" }),
    ).toEqual(["Feature title must not be empty", "Feature acceptance check 2 must not be empty"]);
  });
});
