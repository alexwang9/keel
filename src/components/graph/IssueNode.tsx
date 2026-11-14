"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@/lib/graph/schema";

export type IssueFlowNode = Node<GraphNode, "issue">;

const SIZE_CLASS: Record<NonNullable<GraphNode["size"]>, string> = {
  S: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  M: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  L: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

const badgeClass = "rounded px-1.5 py-0.5 text-[10px] font-semibold";

/** One issue: number, title and size, linking to the issue. Closed issues are muted. */
export function IssueNode({ data }: NodeProps<IssueFlowNode>) {
  const closed = data.state === "closed";
  return (
    <>
      {/* Edges only; the graph is read-only, so the handles are hidden and not connectable. */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`#${String(data.number)}: ${data.title}${closed ? " (closed)" : ""}`}
        className={`flex h-full w-full flex-col gap-1 rounded-lg border px-3 py-2 text-xs shadow-sm hover:border-zinc-500 ${
          closed
            ? "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
            : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-mono font-semibold">#{data.number}</span>
          {data.size && (
            <span className={`${badgeClass} ${SIZE_CLASS[data.size]}`}>{data.size}</span>
          )}
          {closed && <span className={`${badgeClass} bg-zinc-200 dark:bg-zinc-800`}>Closed</span>}
        </span>
        <span className={`line-clamp-2 font-medium ${closed ? "line-through" : ""}`}>
          {data.title}
        </span>
      </a>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="opacity-0"
      />
    </>
  );
}
