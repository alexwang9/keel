import { describe, expect, it } from "vitest";
import { describeSpecEdits, editMessage, sameValue } from "@/lib/spec/edits";
import type { Feature, SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const base: SpecDraft = completeDraft;
const edit = (change: Partial<SpecDraft>): string[] =>
  describeSpecEdits(base, { ...base, ...change });

describe("sameValue", () => {
  it("compares plain values structurally, ignoring key order", () => {
    expect(sameValue({ a: 1, b: [1, { c: "x" }] }, { b: [1, { c: "x" }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
    expect(sameValue({ a: undefined }, {})).toBe(false);
    expect(sameValue(null, {})).toBe(false);
  });
});

describe("describeSpecEdits", () => {
  it("returns nothing when nothing changed", () => {
    expect(describeSpecEdits(base, structuredClone(base))).toEqual([]);
  });

  it("describes text fields with their new value", () => {
    expect(edit({ goal: "One list per club." })).toEqual([
      "Changed the goal to: One list per club.",
    ]);
    expect(edit({ deploymentTarget: undefined })).toEqual(["Cleared the deployment target"]);
  });

  it("describes the project type", () => {
    expect(edit({ projectType: { kind: "cli", detail: "A terminal tool." } })).toEqual([
      "Changed the project type to cli (A terminal tool.)",
    ]);
  });

  it("describes added, changed and removed features with their full content", () => {
    const [f1, f2] = completeDraft.features as [Feature, Feature];
    const lines = edit({
      features: [
        { ...f2, title: "Pick the next book" },
        { id: "F3", title: "Export", description: "Download the list.", acceptanceChecks: ["CSV"] },
      ],
    });
    expect(lines).toEqual([
      `Removed feature F1 "${f1.title}": ${f1.description} Acceptance checks: ${f1.acceptanceChecks.join("; ")}`,
      `Changed feature F2 "Pick the next book": ${f2.description} Acceptance checks: ${f2.acceptanceChecks.join("; ")}`,
      'Added feature F3 "Export": Download the list. Acceptance checks: CSV',
    ]);
  });

  it("describes string lists as their whole new value", () => {
    expect(edit({ outOfScope: ["Buying books"] })).toEqual([
      "Changed out of scope to: Buying books",
    ]);
    expect(edit({ constraints: [] })).toEqual(["Emptied constraints"]);
  });

  it("describes data model items and switching to none and back", () => {
    const model = completeDraft.dataModel;
    expect(
      edit({ dataModel: { ...model, relationships: [], entities: model.entities.slice(0, 1) } }),
    ).toEqual([
      'Removed entity E2 "Book": A book on a club\'s list. Fields: title; author; status',
      "Removed relationship R1 E1 → E2 (one-to-many): A club has many books.",
    ]);
    expect(edit({ dataModel: { none: true, reason: "Stateless." } })).toEqual([
      "Set the data model to none: Stateless.",
    ]);

    const fromNone = describeSpecEdits(
      { ...base, dataModel: { none: true, reason: "Stateless." } },
      base,
    );
    expect(fromNone[0]).toBe("The data model is no longer none");
    expect(fromNone).toHaveLength(4);
  });

  it("describes integrations and auth", () => {
    expect(edit({ integrations: { none: true, reason: "Offline only." } })).toEqual([
      "Set integrations to none: Offline only.",
    ]);
    expect(
      edit({
        integrations: {
          none: false,
          items: [{ id: "I1", name: "Open Library API", purpose: "Covers." }],
        },
      }),
    ).toEqual(['Changed integration I1 "Open Library API": Covers.']);
    expect(edit({ auth: { none: false, description: "GitHub sign-in." } })).toEqual([
      "Changed auth to: GitHub sign-in.",
    ]);
  });

  it("lists edits in template order", () => {
    const lines = edit({
      constraints: [],
      name: "Shelfie",
      auth: { none: true, reason: "Links." },
    });
    expect(lines).toEqual([
      "Changed the name to: Shelfie",
      "Set auth to none: Links.",
      "Emptied constraints",
    ]);
  });
});

describe("editMessage", () => {
  it("joins the note and the edits", () => {
    expect(editMessage("  Please re-check the votes.  ", ["Changed the name to: Shelfie"])).toBe(
      "Please re-check the votes.\n\nI edited the spec in the form. These changes are already applied:\n- Changed the name to: Shelfie",
    );
  });

  it("leaves out whichever part is empty", () => {
    expect(editMessage("", ["Emptied constraints"])).toBe(
      "I edited the spec in the form. These changes are already applied:\n- Emptied constraints",
    );
    expect(editMessage("Add an export feature.", [])).toBe("Add an export feature.");
  });
});
