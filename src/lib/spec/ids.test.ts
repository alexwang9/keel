import { describe, expect, it } from "vitest";
import { nextId } from "@/lib/spec/ids";

describe("nextId", () => {
  it("starts at 1 for an empty list", () => {
    expect(nextId([], "features")).toBe("F1");
  });

  it("uses one past the highest number, even with gaps", () => {
    expect(nextId([{ id: "E1" }, { id: "E7" }, { id: "E3" }], "entities")).toBe("E8");
  });

  it("compares numerically, not as strings", () => {
    expect(nextId([{ id: "Q9" }, { id: "Q10" }], "openQuestions")).toBe("Q11");
  });
});

describe("nextId with foreign ids", () => {
  it("ignores ids that don't belong to the list", () => {
    expect(nextId([{ id: "E5" }, { id: "Fx" }, { id: "F2" }], "features")).toBe("F3");
  });
});
