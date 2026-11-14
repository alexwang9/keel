import { describe, expect, it } from "vitest";
import { layoutGraph, NODE_HEIGHT } from "@/lib/graph/layout";

const nodes = [1, 2, 3, 4].map((number) => ({ number }));
const edges = [
  { from: 1, to: 2 },
  { from: 1, to: 3 },
  { from: 2, to: 4 },
  { from: 3, to: 4 },
];

const yOf = (positions: ReturnType<typeof layoutGraph>, number: number): number =>
  positions.find((position) => position.number === number)?.y ?? NaN;

describe("layoutGraph", () => {
  it("places dependencies above their dependents", () => {
    const positions = layoutGraph(nodes, edges);
    expect(yOf(positions, 1)).toBeLessThan(yOf(positions, 2));
    expect(yOf(positions, 2)).toBe(yOf(positions, 3));
    expect(yOf(positions, 3) + NODE_HEIGHT).toBeLessThan(yOf(positions, 4));
  });

  it("gives the same layout whatever the input order", () => {
    const first = layoutGraph(nodes, edges);
    expect(layoutGraph([...nodes].reverse(), [...edges].reverse())).toEqual(first);
    expect(layoutGraph(nodes, edges)).toEqual(first);
  });

  it("returns one position per node, sorted by number, with nothing overlapping", () => {
    const positions = layoutGraph([{ number: 5 }, { number: 2 }, { number: 9 }], []);
    expect(positions.map((position) => position.number)).toEqual([2, 5, 9]);
    const xs = positions.map((position) => position.x);
    expect(new Set(xs).size).toBe(3);
  });

  it("lays out a cycle without throwing", () => {
    const cycle = [
      { from: 1, to: 2 },
      { from: 2, to: 1 },
    ];
    expect(layoutGraph([{ number: 1 }, { number: 2 }], cycle)).toHaveLength(2);
  });

  it("lays out an empty graph", () => {
    expect(layoutGraph([], [])).toEqual([]);
  });
});
