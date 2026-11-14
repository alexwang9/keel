"use client";

import { Background, Controls, MarkerType, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { IssueNode, type IssueFlowNode } from "@/components/graph/IssueNode";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/layout";
import type { RepoGraph } from "@/lib/graph/schema";

const NODE_TYPES = { issue: IssueNode };

/** Graph nodes and edges as React Flow elements, positioned by the dagre layout. */
export function toFlow(graph: Pick<RepoGraph, "nodes" | "edges">): {
  nodes: IssueFlowNode[];
  edges: Edge[];
} {
  const positions = new Map(
    layoutGraph(graph.nodes, graph.edges).map((position) => [position.number, position]),
  );
  return {
    nodes: graph.nodes.map((node) => {
      const position = positions.get(node.number);
      return {
        id: String(node.number),
        type: "issue",
        data: node,
        position: { x: position?.x ?? 0, y: position?.y ?? 0 },
        // Known sizes let React Flow render before measuring, and match the layout's reservation.
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: `${String(edge.from)}-${String(edge.to)}`,
      source: String(edge.from),
      target: String(edge.to),
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  };
}

/**
 * The read-only dependency graph: dependencies above the issues that need them, arrows pointing
 * down. Pan and zoom only; nodes can't be moved, connected or deleted.
 */
export function DependencyGraph({ graph }: { graph: Pick<RepoGraph, "nodes" | "edges"> }) {
  const { nodes, edges } = useMemo(() => toFlow(graph), [graph]);
  return (
    <div
      aria-label="Dependency graph"
      role="figure"
      className="min-h-80 w-full flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.2}
        // Follows the OS theme like the rest of Keel; the default light theme hid the controls.
        colorMode="system"
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
