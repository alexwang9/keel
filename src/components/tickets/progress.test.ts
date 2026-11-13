import { describe, expect, it } from "vitest";
import {
  initialProgress,
  nextProgress,
  progressLabel,
  type GenerationProgress,
} from "@/components/tickets/progress";
import type { GenerationEvent } from "@/lib/llm/tickets/client";

const fold = (...list: GenerationEvent[]): GenerationProgress =>
  list.reduce(nextProgress, initialProgress);

describe("nextProgress", () => {
  it("moves through thinking, drafting and validating", () => {
    expect(fold({ type: "started" }, { type: "thinking" })).toMatchObject({ phase: "thinking" });
    expect(fold({ type: "drafting", count: 3 })).toEqual({
      phase: "drafting",
      count: 3,
      problems: 0,
    });
    expect(fold({ type: "drafting", count: 3 }, { type: "validating" })).toMatchObject({
      phase: "validating",
      count: 3,
    });
  });

  it("restarts the count for the repair, and keeps saying it's repairing while it thinks", () => {
    const repairing = fold(
      { type: "drafting", count: 5 },
      { type: "repairing", errors: 2 },
      { type: "started" },
      { type: "thinking" },
    );
    expect(repairing).toEqual({ phase: "repairing", count: 0, problems: 2 });
  });
});

describe("progressLabel", () => {
  it.each([
    [initialProgress, "Sending the spec…"],
    [{ phase: "thinking", count: 0, problems: 0 }, "Planning the breakdown…"],
    [{ phase: "drafting", count: 1, problems: 0 }, "Drafting tickets (1 ticket so far)…"],
    [{ phase: "drafting", count: 4, problems: 0 }, "Drafting tickets (4 tickets so far)…"],
    [{ phase: "validating", count: 4, problems: 0 }, "Checking dependencies…"],
    [{ phase: "repairing", count: 0, problems: 1 }, "Fixing 1 problem in the first draft…"],
  ] satisfies [GenerationProgress, string][])("describes %o", (progress, label) => {
    expect(progressLabel(progress)).toBe(label);
  });
});
