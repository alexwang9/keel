import "server-only";
import { z } from "zod";
import type { GitHubClient } from "@/lib/github/client";
import { githubStatus } from "@/lib/github/errors";
import { findRepo } from "@/lib/github/repo";
import type { RepoRef } from "@/lib/github/repo-ref";
import { buildGraph, type GraphIssue } from "@/lib/graph/build";
import type { RepoGraph } from "@/lib/graph/schema";

/** Most issues (and PRs, which share the list) read for one graph; Keel creates at most 100. */
export const MAX_GRAPH_ISSUES = 1000;
const PER_PAGE = 100;

const ListedIssueSchema = z.object({
  number: z.int().positive(),
  title: z.string(),
  html_url: z.url(),
  state: z.enum(["open", "closed"]),
  body: z.string().nullish(),
  // GitHub returns label objects; strings are accepted too, as its API documents both.
  labels: z.array(z.union([z.string(), z.object({ name: z.string().nullish() })])),
  pull_request: z.unknown().optional(),
});

const toGraphIssue = (raw: unknown): GraphIssue | null => {
  const issue = ListedIssueSchema.parse(raw);
  if (issue.pull_request !== undefined) return null;
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state,
    body: issue.body ?? null,
    labels: issue.labels.flatMap((label) =>
      typeof label === "string" ? [label] : label.name ? [label.name] : [],
    ),
  };
};

/**
 * The repo's issues, oldest first, up to `MAX_GRAPH_ISSUES`. A repo with issues turned off
 * (410) has none. Throws other Octokit errors.
 */
async function listIssues(
  client: GitHubClient,
  ref: RepoRef,
): Promise<{ issues: GraphIssue[]; truncated: boolean }> {
  const issues: GraphIssue[] = [];
  let read = 0;
  try {
    const pages = client.paginate.iterator(client.issues.listForRepo, {
      owner: ref.owner,
      repo: ref.name,
      state: "all",
      sort: "created",
      direction: "asc",
      per_page: PER_PAGE,
    });
    for await (const { data } of pages) {
      for (const raw of data) {
        if (read === MAX_GRAPH_ISSUES) return { issues, truncated: true };
        read += 1;
        const issue = toGraphIssue(raw);
        if (issue) issues.push(issue);
      }
    }
  } catch (error) {
    if (githubStatus(error) === 410) return { issues: [], truncated: false };
    throw error;
  }
  return { issues, truncated: false };
}

/**
 * The dependency graph of a repo's Keel issues, read fresh from GitHub, or `null` when the repo
 * doesn't exist or the token can't see it. Throws Octokit errors.
 */
export async function fetchRepoGraph(
  client: GitHubClient,
  ref: RepoRef,
): Promise<RepoGraph | null> {
  const repo = await findRepo(client, ref.owner, ref.name);
  if (!repo) return null;
  const { issues, truncated } = await listIssues(client, { owner: repo.owner, name: repo.name });
  const graph = buildGraph(issues);
  return {
    repo: { fullName: repo.fullName, htmlUrl: repo.htmlUrl },
    ...graph,
    warnings: truncated
      ? [...graph.warnings, { kind: "truncated", limit: MAX_GRAPH_ISSUES }]
      : graph.warnings,
  };
}
