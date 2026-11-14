import "server-only";
import { z } from "zod";
import type { GitHubClient } from "@/lib/github/client";
import { isAlreadyExists } from "@/lib/github/errors";
import type { GitHubRepo } from "@/lib/github/repo";
import { logWarn } from "@/lib/log";
import { ok, type Result } from "@/lib/result";
import { parseIssueBody, renderIssueBody } from "@/lib/tickets/issue-body";
import type { Ticket } from "@/lib/tickets/schema";

// Labels and issues. Like `repo.ts`, these throw unexpected Octokit errors to the create run.

export const STATUS_LABEL = "status:backlog";
export const sizeLabel = (size: Ticket["size"]): string => `size:${size}`;

/** Every label Keel puts on issues, created before any issue. */
export const LABELS = [
  { name: sizeLabel("S"), color: "c2e0c6", description: "Small ticket" },
  { name: sizeLabel("M"), color: "fef2c0", description: "Medium ticket" },
  { name: sizeLabel("L"), color: "f9d0c4", description: "Large ticket" },
  { name: STATUS_LABEL, color: "ededed", description: "Not started" },
] as const;

/** Creates Keel's labels. One that already exists counts as created, whatever its colour. */
export async function ensureLabels(client: GitHubClient, repo: GitHubRepo): Promise<void> {
  for (const label of LABELS) {
    try {
      await client.issues.createLabel({ owner: repo.owner, repo: repo.name, ...label });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }
}

const IssueSchema = z.object({
  number: z.int().positive(),
  body: z.string().nullish(),
  pull_request: z.unknown().optional(),
});

/**
 * Issues already created for these tickets, by their `keel:ticket` marker, so a retry skips
 * them. Uses the issues list, not search, which can lag behind just-created issues. If two
 * issues carry the same marker, the lower number wins.
 */
export async function findTicketIssues(
  client: GitHubClient,
  repo: GitHubRepo,
  ticketIds: ReadonlySet<string>,
): Promise<Map<string, number>> {
  const issues = await client.paginate(client.issues.listForRepo, {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    per_page: 100,
  });
  const found = new Map<string, number>();
  for (const raw of issues) {
    const issue = IssueSchema.parse(raw);
    if (issue.pull_request !== undefined || !issue.body) continue;
    const parsed = parseIssueBody(issue.body);
    if (!parsed.ok || !ticketIds.has(parsed.value.ticketId)) continue;
    const { ticketId } = parsed.value;
    const existing = found.get(ticketId);
    if (existing !== undefined) {
      logWarn("github.duplicate_ticket_issue", {
        ticketId,
        kept: Math.min(existing, issue.number),
      });
    }
    found.set(ticketId, Math.min(existing ?? issue.number, issue.number));
  }
  return found;
}

/**
 * Creates the issue for `ticket`. `numbers` must hold an issue for every dependency, which holds
 * when tickets go in topological order; otherwise this fails without calling GitHub.
 */
export async function createTicketIssue(
  client: GitHubClient,
  repo: GitHubRepo,
  ticket: Ticket,
  numbers: ReadonlyMap<string, number>,
): Promise<Result<number, string>> {
  const body = renderIssueBody(ticket, numbers);
  if (!body.ok) return body;
  const { data } = await client.issues.create({
    owner: repo.owner,
    repo: repo.name,
    title: ticket.title,
    body: body.value,
    labels: [sizeLabel(ticket.size), STATUS_LABEL],
  });
  return ok(IssueSchema.parse(data).number);
}
