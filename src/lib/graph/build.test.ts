import { describe, expect, it } from "vitest";
import { buildGraph, type GraphIssue } from "@/lib/graph/build";
import { ticketMarker } from "@/lib/tickets/issue-body";

const body = (ticketId: string, dependsOn: number[] = []): string =>
  [
    ticketMarker(ticketId),
    `Implements ${ticketId}.`,
    "## Acceptance checks",
    "- [ ] It works.",
    "## Dependencies",
    dependsOn.length === 0 ? "None." : dependsOn.map((n) => `Depends on #${String(n)}`).join("\n"),
  ].join("\n\n");

const issue = (
  number: number,
  dependsOn: number[] = [],
  overrides: Partial<GraphIssue> = {},
): GraphIssue => ({
  number,
  title: `Issue ${String(number)}`,
  url: `https://github.com/octocat/shelf/issues/${String(number)}`,
  state: "open",
  body: body(`T${String(number)}`, dependsOn),
  labels: ["size:M", "status:backlog"],
  ...overrides,
});

describe("buildGraph", () => {
  it("builds nodes and dependency edges from Keel issues", () => {
    const graph = buildGraph([issue(1), issue(2, [1]), issue(3, [1]), issue(4, [2, 3])]);
    expect(graph.nodes.map((node) => node.number)).toEqual([1, 2, 3, 4]);
    expect(graph.nodes[0]).toEqual({
      number: 1,
      title: "Issue 1",
      url: "https://github.com/octocat/shelf/issues/1",
      size: "M",
      state: "open",
      ticketId: "T1",
    });
    expect(graph.edges).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 3, to: 4 },
    ]);
    expect(graph.warnings).toEqual([]);
  });

  it("gives the same graph whatever order the issues arrive in", () => {
    const issues = [issue(1), issue(2, [1]), issue(3, [1]), issue(4, [3, 2])];
    expect(buildGraph([...issues].reverse())).toEqual(buildGraph(issues));
  });

  it("leaves out issues that are neither Keel issues nor labelled status:backlog", () => {
    const graph = buildGraph([issue(1), issue(2, [], { body: "A bug report.", labels: ["bug"] })]);
    expect(graph.nodes.map((node) => node.number)).toEqual([1]);
  });

  it("keeps a Keel issue whose labels were removed on GitHub", () => {
    const graph = buildGraph([issue(1, [], { labels: [] })]);
    expect(graph.nodes).toMatchObject([{ number: 1, size: null, ticketId: "T1" }]);
  });

  it("includes a status:backlog issue without a marker, with no edges and a warning", () => {
    const graph = buildGraph([
      issue(1),
      issue(2, [], { body: "Depends on #1", labels: ["status:backlog"] }),
      issue(3, [], { body: null, labels: ["status:backlog"] }),
    ]);
    expect(graph.nodes.map((node) => [node.number, node.ticketId])).toEqual([
      [1, "T1"],
      [2, null],
      [3, null],
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.warnings).toEqual([
      { kind: "notKeel", issue: 2 },
      { kind: "notKeel", issue: 3 },
    ]);
  });

  it("treats an unsupported marker version as no marker", () => {
    const graph = buildGraph([
      issue(1, [], { body: "<!-- keel:ticket=T1 v9 -->\n\nLater format.", labels: [] }),
    ]);
    expect(graph.nodes).toEqual([]);
  });

  it("warns about a dependency on an issue that isn't in the graph", () => {
    const graph = buildGraph([issue(1), issue(2, [1, 42])]);
    expect(graph.edges).toEqual([{ from: 1, to: 2 }]);
    expect(graph.warnings).toEqual([{ kind: "unknownDependency", issue: 2, dependency: 42 }]);
  });

  it("drops edges to a dependency removed on GitHub", () => {
    const graph = buildGraph([issue(1), issue(2, [])]);
    expect(graph.edges).toEqual([]);
    expect(graph.warnings).toEqual([]);
  });

  it("warns about a self-dependency without drawing it", () => {
    const graph = buildGraph([issue(1, [1])]);
    expect(graph.edges).toEqual([]);
    expect(graph.warnings).toEqual([{ kind: "selfDependency", issue: 1 }]);
  });

  it("keeps the edges of a cycle and reports its path", () => {
    const graph = buildGraph([issue(1, [3]), issue(2, [1]), issue(3, [2])]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.warnings).toEqual([{ kind: "cycle", path: [1, 3, 2, 1] }]);
  });

  it("reads closed issues and sizes from labels", () => {
    const graph = buildGraph([
      issue(1, [], { state: "closed", labels: ["size:S"] }),
      issue(2, [], { labels: ["size:S", "size:L"] }),
      issue(3, [], { labels: ["size:L", "status:backlog"] }),
    ]);
    expect(graph.nodes.map((node) => [node.state, node.size])).toEqual([
      ["closed", "S"],
      ["open", null],
      ["open", "L"],
    ]);
  });

  it("builds an empty graph from no issues", () => {
    expect(buildGraph([])).toEqual({ nodes: [], edges: [], warnings: [] });
  });
});
