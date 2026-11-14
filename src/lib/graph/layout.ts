import { Graph, layout } from "@dagrejs/dagre";
import type { GraphEdge, GraphNode } from "@/lib/graph/schema";

/** Node size the layout reserves; the graph view renders nodes at this size. */
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 76;

export interface NodePosition {
  number: number;
  // Top-left corner, as React Flow positions nodes (dagre reports centres).
  x: number;
  y: number;
}

/**
 * Lays the graph out top to bottom with dagre, dependencies above their dependents. Nodes and
 * edges are added in a fixed order (by number), so the same graph always gets the same layout.
 */
export function layoutGraph(
  nodes: readonly Pick<GraphNode, "number">[],
  edges: readonly GraphEdge[],
): NodePosition[] {
  const graph = new Graph<object, { width: number; height: number; x?: number; y?: number }>();
  graph.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 64, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));

  const numbers = nodes.map((node) => node.number).sort((a, b) => a - b);
  for (const number of numbers) {
    graph.setNode(String(number), { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const sorted = [...edges].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const edge of sorted) graph.setEdge(String(edge.from), String(edge.to));
  layout(graph);

  return numbers.map((number) => {
    const { x = 0, y = 0 } = graph.node(String(number));
    return { number, x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 };
  });
}
