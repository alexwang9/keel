import { z } from "zod";
import { TicketSchema } from "@/lib/tickets/schema";

// The dependency graph `GET /api/github/graph` answers with, built from a repo's issues.

const IssueNumberSchema = z.int().positive();

export const GraphNodeSchema = z.object({
  number: IssueNumberSchema,
  title: z.string(),
  url: z.url(),
  // From the issue's single `size:*` label; `null` when it has none or several.
  size: TicketSchema.shape.size.nullable(),
  state: z.enum(["open", "closed"]),
  // From the `keel:ticket` marker; `null` for an issue that only carries `status:backlog`.
  ticketId: z.string().nullable(),
});

/** `from` is the dependency, `to` the issue that depends on it, so a layout reads top-down. */
export const GraphEdgeSchema = z.object({ from: IssueNumberSchema, to: IssueNumberSchema });

/** Things edited on GitHub that the graph shows around rather than fails on. */
export const GraphWarningSchema = z.discriminatedUnion("kind", [
  // `Depends on #N` where #N isn't an issue in the graph (a PR, another issue, or none).
  z.object({
    kind: z.literal("unknownDependency"),
    issue: IssueNumberSchema,
    dependency: IssueNumberSchema,
  }),
  z.object({ kind: z.literal("selfDependency"), issue: IssueNumberSchema }),
  // Starts and ends at the same issue; each step is "depends on".
  z.object({ kind: z.literal("cycle"), path: z.array(IssueNumberSchema).min(2) }),
  // Labelled `status:backlog` but without a readable Keel marker, so its dependencies are unknown.
  z.object({ kind: z.literal("notKeel"), issue: IssueNumberSchema }),
  // The repo had more issues than Keel reads; the graph covers the oldest ones.
  z.object({ kind: z.literal("truncated"), limit: z.int().positive() }),
]);

export const RepoGraphSchema = z.object({
  repo: z.object({ fullName: z.string().min(1), htmlUrl: z.url() }),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  warnings: z.array(GraphWarningSchema),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphWarning = z.infer<typeof GraphWarningSchema>;
export type RepoGraph = z.infer<typeof RepoGraphSchema>;
