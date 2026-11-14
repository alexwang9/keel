import "server-only";
import type { GitHubClient } from "@/lib/github/client";
import { createError, githubErrorCode } from "@/lib/github/errors";
import type { CreateError, CreateEvent, CreateStep } from "@/lib/github/events";
import { createTicketIssue, ensureLabels, findTicketIssues } from "@/lib/github/issues";
import { renderReadme, repoDescription } from "@/lib/github/readme";
import {
  commitFiles,
  countCommits,
  createRepo,
  findRepo,
  readFile,
  type BranchWait,
  type GitHubRepo,
  type RepoFile,
} from "@/lib/github/repo";
import type { CreateRequest } from "@/lib/github/request";
import { logError, logWarn } from "@/lib/log";
import { err, ok, type Result } from "@/lib/result";
import { renderSpecMarkdown } from "@/lib/spec/render";
import { renderTranscriptMarkdown } from "@/lib/spec/transcript";
import { topoSort } from "@/lib/tickets/dag";

/**
 * Each create request stops itself here with `paused`, before Vercel Hobby's 300s limit, and the
 * client sends it again. Octokit spaces issue creation ~3s apart, so ~80 issues fit in one run.
 */
export const CREATE_DEADLINE_MS = 270_000;

export const COMMIT_MESSAGE = "Add the Keel spec, interview transcript and README";

export interface CreateOptions {
  /** The signed-in user, who owns the repo. */
  login: string;
  deadlineMs: number;
  now: () => number;
  branchWait: BranchWait;
  signal?: AbortSignal;
}

type StepResult<T> = Result<T, CreateError>;

/** Runs one step's GitHub calls, turning an unexpected error into a logged, typed error. */
async function guard<T>(
  step: CreateStep,
  task: () => Promise<StepResult<T>>,
): Promise<StepResult<T>> {
  try {
    return await task();
  } catch (error) {
    const code = githubErrorCode(error);
    logError("github.create_failed", error, { step, code });
    return err(createError(step, code));
  }
}

export const repoFiles = (request: CreateRequest): RepoFile[] => [
  { path: "SPEC.md", content: renderSpecMarkdown(request.spec) },
  { path: "docs/interview.md", content: renderTranscriptMarkdown(request.transcript) },
  { path: "README.md", content: renderReadme(request.spec) },
];

interface RepoStep {
  repo: GitHubRepo;
  created: boolean;
  committed: boolean;
}

/**
 * A repo is safe to resume into when its SPEC.md is exactly this spec's (the commit is done), or
 * when it has no SPEC.md and only GitHub's initial commit (creation stopped before the commit).
 * Anything else may be someone else's work, or another Keel project's issues.
 */
async function resumeInto(
  client: GitHubClient,
  request: CreateRequest,
  login: string,
): Promise<StepResult<RepoStep>> {
  const repo = await findRepo(client, login, request.repoName);
  if (!repo) return err(createError("repo", "not_found"));
  const spec = await readFile(client, repo, "SPEC.md");
  if (spec !== null) {
    if (spec === renderSpecMarkdown(request.spec))
      return ok({ repo, created: false, committed: true });
    logWarn("github.resume_refused", { reason: "spec_differs" });
    return err(createError("repo", "not_resumable"));
  }
  if ((await countCommits(client, repo)) !== 1) {
    logWarn("github.resume_refused", { reason: "other_commits" });
    return err(createError("repo", "not_resumable"));
  }
  return ok({ repo, created: false, committed: false });
}

async function repoStep(
  client: GitHubClient,
  request: CreateRequest,
  login: string,
): Promise<StepResult<RepoStep>> {
  if (request.resume) return resumeInto(client, request, login);
  const created = await createRepo(client, request.repoName, repoDescription(request.spec));
  if (!created.ok) return err(createError("repo", created.error));
  return ok({ repo: created.value, created: true, committed: false });
}

/** Creates the issues in topological order, skipping tickets that already have one. */
async function* issueSteps(
  client: GitHubClient,
  repo: GitHubRepo,
  request: CreateRequest,
  outOfTime: () => boolean,
): AsyncGenerator<CreateEvent, boolean> {
  const sorted = topoSort(request.tickets);
  // The request schema already rejects an invalid DAG.
  if (!sorted.ok) throw new Error("create request tickets are not a valid DAG");
  const ids = new Set(sorted.value.map((ticket) => ticket.id));
  const found = await guard("issues", async () => ok(await findTicketIssues(client, repo, ids)));
  if (!found.ok) {
    yield { type: "error", error: found.error };
    return false;
  }
  const numbers = new Map(found.value);
  for (const ticket of sorted.value) {
    const existing = numbers.get(ticket.id);
    if (existing !== undefined) {
      yield { type: "issue", ticketId: ticket.id, number: existing, existed: true };
      continue;
    }
    if (outOfTime()) {
      yield { type: "paused" };
      return false;
    }
    const created = await guard("issues", async () => {
      const result = await createTicketIssue(client, repo, ticket, numbers);
      if (!result.ok) throw new Error(result.error);
      return result;
    });
    if (!created.ok) {
      yield { type: "error", error: created.error };
      return false;
    }
    numbers.set(ticket.id, created.value);
    yield { type: "issue", ticketId: ticket.id, number: created.value, existed: false };
  }
  return true;
}

/**
 * Creates the repo, its one commit, the labels and the issues, streaming progress. Every step is
 * idempotent: a resumed run finds the repo, skips the commit when SPEC.md is there, treats
 * existing labels as created and reconciles issues by their `keel:ticket` marker, so it never
 * duplicates anything. Nothing is ever deleted.
 */
export async function* runCreate(
  client: GitHubClient,
  request: CreateRequest,
  options: CreateOptions,
): AsyncGenerator<CreateEvent> {
  const started = options.now();
  const outOfTime = (): boolean => options.now() - started >= options.deadlineMs;

  const repoResult = await guard("repo", () => repoStep(client, request, options.login));
  if (!repoResult.ok) {
    yield { type: "error", error: repoResult.error };
    return;
  }
  const { repo, created, committed } = repoResult.value;
  yield { type: "repo", repo: { fullName: repo.fullName, htmlUrl: repo.htmlUrl }, created };

  if (committed) {
    yield { type: "step", step: "commit", status: "skipped" };
  } else {
    const commit = await guard("commit", async () => {
      await commitFiles(client, repo, repoFiles(request), COMMIT_MESSAGE, options.branchWait);
      return ok(undefined);
    });
    if (!commit.ok) {
      yield { type: "error", error: commit.error };
      return;
    }
    yield { type: "step", step: "commit", status: "done" };
  }
  if (options.signal?.aborted) return;

  const labels = await guard("labels", async () => {
    await ensureLabels(client, repo);
    return ok(undefined);
  });
  if (!labels.ok) {
    yield { type: "error", error: labels.error };
    return;
  }
  yield { type: "step", step: "labels", status: "done" };
  if (options.signal?.aborted) return;

  const done = yield* issueSteps(
    client,
    repo,
    request,
    () => outOfTime() || options.signal?.aborted === true,
  );
  if (done) yield { type: "complete" };
}
