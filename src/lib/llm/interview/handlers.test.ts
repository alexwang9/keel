import { describe, expect, it } from "vitest";
import { handleToolCall } from "@/lib/llm/interview/handlers";
import type { SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const call = (name: string, input: unknown) => ({ id: "toolu_1", name, input });

const setName = { ops: [{ op: "set", field: "name", value: "Shelf" }] };

describe("handleToolCall: update_spec", () => {
  it("applies a valid patch and reports what is still missing", () => {
    const outcome = handleToolCall(call("update_spec", setName), {});

    expect(outcome.kind).toBe("patched");
    if (outcome.kind !== "patched") return;
    expect(outcome.draft).toEqual({ name: "Shelf" });
    expect(outcome.ops).toEqual(setName.ops);
    expect(outcome.result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(outcome.result.is_error).toBeUndefined();
    expect(outcome.result.content).toContain("Applied 1 op(s).");
    expect(outcome.result.content).toContain("- problem");
    expect(outcome.result.content).not.toContain("- name");
  });

  it("tells the model to confirm and finish once nothing is missing", () => {
    const outcome = handleToolCall(
      call("update_spec", { ops: [{ op: "set", field: "name", value: "Shelf 2" }] }),
      completeDraft,
    );
    expect(outcome.result.content).toContain("Nothing is missing");
    expect(outcome.result.content).toContain("finish_interview");
  });

  it("rejects an invalid patch with the errors and leaves the draft alone", () => {
    const draft: SpecDraft = { name: "Shelf" };
    const outcome = handleToolCall(
      call("update_spec", {
        ops: [{ op: "upsert", list: "features", item: { id: "X1", title: "t" } }],
      }),
      draft,
    );

    expect(outcome.kind).toBe("rejected");
    expect(outcome.result.is_error).toBe(true);
    expect(outcome.result.content).toContain("Nothing was changed.");
    expect(outcome.result.content).toMatch(/ops\.0\.item/);
    expect(draft).toEqual({ name: "Shelf" });
  });

  it("rejects a patch that breaks a cross-item rule", () => {
    const outcome = handleToolCall(
      call("update_spec", {
        ops: [
          {
            op: "upsert",
            list: "relationships",
            item: { id: "R1", from: "E1", to: "E2", kind: "one-to-many", description: "d" },
          },
        ],
      }),
      {},
    );
    expect(outcome.kind).toBe("rejected");
    expect(outcome.result.content).toContain("unknown entity E1");
  });

  it.each([
    ["no ops field", {}],
    ["empty ops", { ops: [] }],
    ["ops of the wrong type", { ops: "set name" }],
  ])("rejects input with %s", (_label, input) => {
    const outcome = handleToolCall(call("update_spec", input), {});
    expect(outcome.kind).toBe("rejected");
    expect(outcome.result.is_error).toBe(true);
  });
});

describe("handleToolCall: finish_interview", () => {
  it("accepts a complete draft and returns the spec", () => {
    const outcome = handleToolCall(call("finish_interview", {}), completeDraft);

    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.spec.name).toBe(completeDraft.name);
    expect(outcome.result.is_error).toBeUndefined();
  });

  it("rejects a premature finish and names the gaps", () => {
    const outcome = handleToolCall(call("finish_interview", {}), { name: "Shelf" });

    expect(outcome.kind).toBe("rejected");
    expect(outcome.result.is_error).toBe(true);
    expect(outcome.result.content).toContain("not complete");
    expect(outcome.result.content).toContain("- problem");
    expect(outcome.result.content).toContain("- features (none yet)");
  });

  it("rejects a finish while open questions remain", () => {
    const draft: SpecDraft = {
      ...completeDraft,
      openQuestions: [{ id: "Q1", question: "Which login provider?" }],
    };
    const outcome = handleToolCall(call("finish_interview", {}), draft);
    expect(outcome.kind).toBe("rejected");
    expect(outcome.result.content).toContain("openQuestions (1 unresolved)");
  });
});

describe("handleToolCall: unknown tools", () => {
  it("returns an error result instead of throwing", () => {
    const outcome = handleToolCall(call("delete_repo", {}), {});
    expect(outcome).toMatchObject({
      kind: "rejected",
      result: { is_error: true, content: "Unknown tool delete_repo." },
    });
  });
});
