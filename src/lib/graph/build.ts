import { STATUS_LABEL } from "@/lib/github/issues";
import type { GraphEdge, GraphNode, GraphWarning, RepoGraph } from "@/lib/graph/schema";
import { parseIssueBody } from "@/lib/tickets/issue-body";
import { validateDag } from "@/lib/tickets/dag";
import type { Ticket } from "@/lib/tickets/schema";

/** An issue as the graph reads it, already validated and with PRs left out. */
export interface GraphIssue {
  number: number;
  title: string;
  url: string;
  state: GraphNode["state"];
  body: string | null;
  labels: string[];
}

const SIZES: readonly Ticket["size"][] = ["S", "M", "L"];

/** The size from exactly one `size:*` label; none or several (relabelled on GitHub) is `null`. */
function sizeOf(labels: readonly string[]): GraphNode["size"] {
  const sizes = SIZES.filter((size) => labels.includes(`size:${size}`));
  return sizes.length === 1 ? (sizes[0] ?? null) : null;
}

interface Included {
  node: GraphNode;
  // `null` when the body has no readable marker, so the dependencies are unknown.
  dependsOn: number[] | null;
}

/** The issue as a node if it belongs in the graph: a Keel marker, or the `status:backlog` label. */
function include(issue: GraphIssue): Included | null {
  const parsed = issue.body === null ? null : parseIssueBody(issue.body);
  const keel = parsed?.ok === true ? parsed.value : null;
  if (!keel && !issue.labels.includes(STATUS_LABEL)) return null;
  return {
    node: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      size: sizeOf(issue.labels),
      state: issue.state,
      ticketId: keel?.ticketId ?? null,
    },
    dependsOn: keel?.dependsOn ?? null,
  };
}

/** Edges for one issue's dependencies, plus warnings for the ones that can't be drawn. */
function edgesFor(
  { node, dependsOn }: Included,
  known: ReadonlySet<number>,
): { edges: GraphEdge[]; warnings: GraphWarning[] } {
  if (dependsOn === null) return { edges: [], warnings: [{ kind: "notKeel", issue: node.number }] };
  const edges: GraphEdge[] = [];
  const warnings: GraphWarning[] = [];
  for (const dependency of dependsOn) {
    if (dependency === node.number) warnings.push({ kind: "selfDependency", issue: node.number });
    else if (!known.has(dependency))
      warnings.push({ kind: "unknownDependency", issue: node.number, dependency });
    else edges.push({ from: dependency, to: node.number });
  }
  return { edges, warnings };
}

/** Cycles made by edits on GitHub, found with the ticket DAG check over issue numbers. */
function cycleWarnings(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphWarning[] {
  const dag = validateDag(
    nodes.map((node) => ({
      id: String(node.number),
      dependsOn: edges.filter((edge) => edge.to === node.number).map((edge) => String(edge.from)),
    })),
  );
  if (dag.ok) return [];
  return dag.error.flatMap((error): GraphWarning[] =>
    error.kind === "cycle" ? [{ kind: "cycle", path: error.path.map(Number) }] : [],
  );
}

/**
 * Builds the dependency graph from a repo's issues. GitHub is the source of truth, so edits made
 * there never fail the build: dependencies that can't be drawn become warnings, and cycles keep
 * their edges and get a warning. Nodes are sorted by number and edges by `from` then `to`, so the
 * same issues always give the same graph.
 */
export function buildGraph(
  issues: readonly GraphIssue[],
): Pick<RepoGraph, "nodes" | "edges" | "warnings"> {
  const included = issues
    .flatMap((issue) => include(issue) ?? [])
    .sort((a, b) => a.node.number - b.node.number);
  const known = new Set(included.map(({ node }) => node.number));
  const perIssue = included.map((entry) => edgesFor(entry, known));
  const nodes = included.map(({ node }) => node);
  const edges = perIssue
    .flatMap((result) => result.edges)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    nodes,
    edges,
    warnings: [...perIssue.flatMap((result) => result.warnings), ...cycleWarnings(nodes, edges)],
  };
}
