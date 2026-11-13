import { describe, expect, it } from "vitest";
import {
  formatDagError,
  topoSort,
  validateDag,
  type DagError,
  type DagNode,
} from "@/lib/tickets/dag";
import { chain, shelfTickets } from "@/test/fixtures/tickets";

const node = (id: string, ...dependsOn: string[]): DagNode => ({ id, dependsOn });

function errorsFor(nodes: readonly DagNode[]): DagError[] {
  const result = validateDag(nodes);
  if (result.ok) throw new Error("expected the graph to be rejected");
  return result.error;
}

function sortedIds(nodes: readonly DagNode[]): string[] {
  const result = topoSort(nodes);
  if (!result.ok)
    throw new Error(`expected a valid graph: ${result.error.map(formatDagError).join("; ")}`);
  return result.value.map((entry) => entry.id);
}

describe("validateDag: valid graphs", () => {
  it.each([
    ["an empty list", []],
    ["a single ticket", [node("T1")]],
    ["the Shelf fixture", shelfTickets],
    [
      "a diamond listed out of order",
      [node("T4", "T2", "T3"), node("T3", "T1"), node("T2", "T1"), node("T1")],
    ],
  ])("accepts %s", (_label, nodes) => {
    expect(validateDag(nodes).ok).toBe(true);
  });
});

describe("validateDag: references", () => {
  it("reports unknown and self references in ticket order", () => {
    expect(errorsFor([node("T1", "T9"), node("T2", "T1", "T2", "T7")])).toEqual([
      { kind: "unknownDependency", ticket: "T1", dependency: "T9" },
      { kind: "selfDependency", ticket: "T2" },
      { kind: "unknownDependency", ticket: "T2", dependency: "T7" },
    ]);
  });

  it("reports a self reference once, not also as a cycle", () => {
    expect(errorsFor([node("T1", "T1")])).toEqual([{ kind: "selfDependency", ticket: "T1" }]);
  });
});

describe("validateDag: cycles", () => {
  it("reports a two-ticket cycle", () => {
    expect(errorsFor([node("T1", "T2"), node("T2", "T1")])).toEqual([
      { kind: "cycle", path: ["T1", "T2", "T1"] },
    ]);
  });

  it("starts the path at the lowest id, comparing numerically", () => {
    const nodes = [node("T10", "T9"), node("T9", "T11"), node("T11", "T10")];

    expect(errorsFor(nodes)).toEqual([{ kind: "cycle", path: ["T9", "T11", "T10", "T9"] }]);
  });

  it("reports the shortest cycle through the start when a group has several", () => {
    // T1 → T2 → T3 → T1 and T1 → T3 → T1: the second is shorter.
    const nodes = [node("T1", "T2", "T3"), node("T2", "T3"), node("T3", "T1")];

    expect(errorsFor(nodes)).toEqual([{ kind: "cycle", path: ["T1", "T3", "T1"] }]);
  });

  it("reports one path per separate cycle, ordered by first ticket", () => {
    const nodes = [
      node("T5", "T6"),
      node("T6", "T5"),
      node("T1"),
      node("T2", "T3", "T1"),
      node("T3", "T2"),
      node("T4", "T2"), // depends on a cycle without being part of it
    ];

    expect(errorsFor(nodes)).toEqual([
      { kind: "cycle", path: ["T2", "T3", "T2"] },
      { kind: "cycle", path: ["T5", "T6", "T5"] },
    ]);
  });

  it("reports reference errors before cycles", () => {
    expect(errorsFor([node("T1", "T2", "T9"), node("T2", "T1")]).map(formatDagError)).toEqual([
      "T1 depends on unknown ticket T9",
      "dependency cycle: T1 → T2 → T1",
    ]);
  });
});

describe("validateDag: large graphs", () => {
  it("handles a 10,000-ticket chain without overflowing the stack", () => {
    expect(validateDag(chain(10_000)).ok).toBe(true);
  });

  it("finds a cycle closed at the end of a 10,000-ticket chain", () => {
    const nodes = chain(10_000).map((entry) =>
      entry.id === "T1" ? { ...entry, dependsOn: ["T10000"] } : entry,
    );

    const [error] = errorsFor(nodes);
    expect(error?.kind === "cycle" && error.path.length).toBe(10_001);
    expect(error?.kind === "cycle" && [error.path[0], error.path[1], error.path.at(-1)]).toEqual([
      "T1",
      "T10000",
      "T1",
    ]);
  });
});

describe("formatDagError", () => {
  it("names the offending tickets", () => {
    expect(formatDagError({ kind: "selfDependency", ticket: "T3" })).toBe("T3 depends on itself");
  });
});

describe("topoSort", () => {
  it("returns an already-ordered list unchanged", () => {
    expect(sortedIds(shelfTickets)).toEqual(["T1", "T2", "T3", "T4"]);
  });

  it("puts dependencies first, breaking ties by input position", () => {
    const nodes = [
      node("T4", "T2", "T3"),
      node("T3", "T1"),
      node("T2", "T1"),
      node("T1"),
      node("T5"),
    ];

    expect(sortedIds(nodes)).toEqual(["T1", "T3", "T2", "T4", "T5"]);
  });

  it("moves a ticket only as far as its dependencies require", () => {
    // T3 must follow T1; T2 and T1 are both ready at the start, so input order decides.
    const nodes = [node("T3", "T1"), node("T2"), node("T1")];

    expect(sortedIds(nodes)).toEqual(["T2", "T1", "T3"]);
  });

  it("is deterministic and returns the same objects", () => {
    const reversed = [...shelfTickets].reverse();
    const first = topoSort(reversed);

    expect(first).toEqual(topoSort(reversed));
    expect(first.ok && first.value[0]).toBe(shelfTickets[0]);
  });

  it("sorts a reversed 10,000-ticket chain", () => {
    const ids = sortedIds(chain(10_000).reverse());

    expect(ids[0]).toBe("T1");
    expect(ids.at(-1)).toBe("T10000");
  });

  it("sorts 10,000 independent tickets in input order", () => {
    const nodes = Array.from({ length: 10_000 }, (_, index) => node(`T${String(10_000 - index)}`));

    expect(sortedIds(nodes)).toEqual(nodes.map((entry) => entry.id));
  });

  it("fails with the validation errors on an invalid graph", () => {
    expect(topoSort([node("T1", "T2"), node("T2", "T1")])).toEqual({
      ok: false,
      error: [{ kind: "cycle", path: ["T1", "T2", "T1"] }],
    });
  });
});
