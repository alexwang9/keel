import { describe, expect, it } from "vitest";
import { applySpecPatch } from "@/lib/spec/patch";
import type { Entity, Feature, SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const feature = (id: string, title = `Feature ${id}`): Feature => ({
  id,
  title,
  description: "Does a thing.",
  acceptanceChecks: ["It works."],
});

const entity = (id: string): Entity => ({
  id,
  name: `Entity ${id}`,
  description: "A record.",
  fields: [],
});

function applied(draft: SpecDraft, ops: unknown): SpecDraft {
  const result = applySpecPatch(draft, ops);
  if (!result.ok) throw new Error(`expected the patch to apply: ${result.error.join("; ")}`);
  return result.value;
}

function errorsFor(draft: SpecDraft, ops: unknown): string[] {
  const result = applySpecPatch(draft, ops);
  if (result.ok) throw new Error("expected the patch to be rejected");
  return result.error;
}

describe("applySpecPatch: set", () => {
  it("sets scalar fields on an empty draft", () => {
    const draft = applied({}, [
      { op: "set", field: "name", value: "  Shelf  " },
      { op: "set", field: "projectType", value: { kind: "cli", detail: "A Node CLI." } },
    ]);

    expect(draft).toEqual({ name: "Shelf", projectType: { kind: "cli", detail: "A Node CLI." } });
  });

  it("replaces a whole field", () => {
    const draft = applied(completeDraft, [
      { op: "set", field: "outOfScope", value: ["Mobile apps"] },
      { op: "set", field: "integrations", value: { none: true, reason: "Self-contained." } },
    ]);

    expect(draft.outOfScope).toEqual(["Mobile apps"]);
    expect(draft.integrations).toEqual({ none: true, reason: "Self-contained." });
  });
});

describe("applySpecPatch: upsert", () => {
  it("appends a new item", () => {
    const draft = applied({ features: [feature("F1")] }, [
      { op: "upsert", list: "features", item: feature("F2") },
    ]);

    expect(draft.features?.map((item) => item.id)).toEqual(["F1", "F2"]);
  });

  it("replaces an existing item in place", () => {
    const start = { features: [feature("F1"), feature("F2"), feature("F3")] };
    const draft = applied(start, [
      { op: "upsert", list: "features", item: feature("F2", "Renamed") },
    ]);

    expect(draft.features?.map((item) => item.title)).toEqual([
      "Feature F1",
      "Renamed",
      "Feature F3",
    ]);
  });

  it("creates the data model when upserting into an unanswered or none one", () => {
    const fromEmpty = applied({}, [{ op: "upsert", list: "entities", item: entity("E1") }]);
    const fromNone = applied({ dataModel: { none: true, reason: "Stateless." } }, [
      { op: "upsert", list: "entities", item: entity("E1") },
    ]);

    const expected = { none: false, entities: [entity("E1")], relationships: [] };
    expect(fromEmpty.dataModel).toEqual(expected);
    expect(fromNone.dataModel).toEqual(expected);
  });

  it("switches integrations from none to a list", () => {
    const item = { id: "I1", name: "Stripe", purpose: "Payments." };
    const draft = applied({ integrations: { none: true, reason: "None needed." } }, [
      { op: "upsert", list: "integrations", item },
    ]);

    expect(draft.integrations).toEqual({ none: false, items: [item] });
  });

  it("applies ops in order, so an entity and its relationship can arrive together", () => {
    const draft = applied({}, [
      { op: "upsert", list: "entities", item: entity("E1") },
      { op: "upsert", list: "entities", item: entity("E2") },
      {
        op: "upsert",
        list: "relationships",
        item: { id: "R1", from: "E1", to: "E2", kind: "one-to-many", description: "Owns." },
      },
    ]);

    expect(draft.dataModel?.none === false && draft.dataModel.relationships).toHaveLength(1);
  });
});

describe("applySpecPatch: remove", () => {
  it("removes an item by id", () => {
    const draft = applied(completeDraft, [{ op: "remove", list: "features", id: "F1" }]);

    expect(draft.features?.map((item) => item.id)).toEqual(["F2"]);
  });

  it("rejects an unknown id", () => {
    expect(errorsFor(completeDraft, [{ op: "remove", list: "openQuestions", id: "Q9" }])).toEqual([
      "ops.0 no openQuestions item with id Q9",
    ]);
  });

  it("rejects removing from a data model marked none", () => {
    const draft: SpecDraft = { dataModel: { none: true, reason: "Stateless." } };

    expect(errorsFor(draft, [{ op: "remove", list: "entities", id: "E1" }])).toEqual([
      "ops.0 no entities item with id E1",
    ]);
  });

  it("rejects removing an entity a relationship still uses, unless both go", () => {
    expect(errorsFor(completeDraft, [{ op: "remove", list: "entities", id: "E2" }])).toEqual([
      "dataModel.relationships.0.to refers to unknown entity E2",
    ]);

    const draft = applied(completeDraft, [
      { op: "remove", list: "relationships", id: "R1" },
      { op: "remove", list: "entities", id: "E2" },
    ]);
    expect(draft.dataModel?.none === false && draft.dataModel.entities).toHaveLength(1);
  });
});

describe("applySpecPatch: invalid patches", () => {
  it("rejects an id with the wrong prefix for its list", () => {
    expect(
      errorsFor({}, [{ op: "upsert", list: "features", item: { ...feature("F1"), id: "E1" } }]),
    ).toEqual(["ops.0.item.id must look like F1, F2, …"]);
  });

  it("rejects empty text and over-long text", () => {
    const errors = errorsFor({}, [
      { op: "set", field: "goal", value: "   " },
      { op: "set", field: "name", value: "x".repeat(201) },
    ]);

    expect(errors).toEqual([
      "ops.0.value must not be empty",
      "ops.1.value must be at most 200 characters",
    ]);
  });

  it("rejects a relationship to an unknown entity", () => {
    const relationship = { id: "R2", from: "E1", to: "E9", kind: "one-to-one", description: "x" };

    expect(
      errorsFor(completeDraft, [{ op: "upsert", list: "relationships", item: relationship }]),
    ).toEqual(["dataModel.relationships.1.to refers to unknown entity E9"]);
  });

  it.each([
    ["not an array", { op: "set" }, /^ops Invalid input: expected array/],
    ["an empty patch", [], /^ops must contain at least one op$/],
    ["an unknown op", [{ op: "rename", field: "name", value: "x" }], /^ops\.0\.op Invalid/],
    ["a list field via set", [{ op: "set", field: "features", value: [] }], /^ops\.0\.field /],
    ["an unknown list", [{ op: "remove", list: "outOfScope", id: "O1" }], /^ops\.0\.list /],
  ])("rejects %s", (_label, ops, message) => {
    const errors = errorsFor({}, ops);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
  });

  it("applies nothing when any op fails, and never mutates the draft", () => {
    const draft = structuredClone(completeDraft);
    const result = applySpecPatch(draft, [
      { op: "set", field: "name", value: "Renamed" },
      { op: "remove", list: "features", id: "F9" },
    ]);

    expect(result.ok).toBe(false);
    expect(draft).toEqual(completeDraft);

    applied(draft, [{ op: "upsert", list: "features", item: feature("F1", "Changed") }]);
    expect(draft).toEqual(completeDraft);
  });
});
