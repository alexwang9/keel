import "server-only";
import { z } from "zod";
import type { GitHubClient } from "@/lib/github/client";
import { githubStatus, isAlreadyExists } from "@/lib/github/errors";
import { err, ok, type Result } from "@/lib/result";

// Repo-level GitHub calls. They throw Octokit errors other than the statuses they expect, and the
// create run turns those into typed error events for the step that failed.

const RepoSchema = z.object({
  name: z.string().min(1),
  full_name: z.string().min(1),
  html_url: z.url(),
  default_branch: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
});

export interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
}

export interface RepoFile {
  path: string;
  content: string;
}

const toRepo = (data: unknown): GitHubRepo => {
  const repo = RepoSchema.parse(data);
  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
  };
};

/** The repo, or `null` when it doesn't exist (or the token can't see it, e.g. a private one). */
export async function findRepo(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<GitHubRepo | null> {
  try {
    const { data } = await client.repos.get({ owner, repo: name });
    return toRepo(data);
  } catch (error) {
    if (githubStatus(error) === 404) return null;
    throw error;
  }
}

/**
 * Creates a public repo in the user's account with an initial commit, so a branch exists for the
 * Git Data API to build on. A name already in use (perhaps by a private repo) is `name_taken`.
 */
export async function createRepo(
  client: GitHubClient,
  name: string,
  description: string,
): Promise<Result<GitHubRepo, "name_taken">> {
  try {
    const { data } = await client.repos.createForAuthenticatedUser({
      name,
      description,
      private: false,
      auto_init: true,
    });
    return ok(toRepo(data));
  } catch (error) {
    if (isAlreadyExists(error)) return err("name_taken");
    throw error;
  }
}

const FileSchema = z.object({ type: z.literal("file"), content: z.string(), encoding: z.string() });

/** A text file on the default branch, or `null` when there isn't one at `path`. */
export async function readFile(
  client: GitHubClient,
  repo: GitHubRepo,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await client.repos.getContent({
      owner: repo.owner,
      repo: repo.name,
      path,
      ref: repo.defaultBranch,
    });
    const file = FileSchema.safeParse(data);
    if (!file.success) return null;
    if (file.data.encoding !== "base64") return file.data.content;
    return Buffer.from(file.data.content, "base64").toString("utf8");
  } catch (error) {
    // 404: no such file. 409: the repo has no commits yet.
    const status = githubStatus(error);
    if (status === 404 || status === 409) return null;
    throw error;
  }
}

/** How many commits the default branch has, counting at most two. An empty repo has none. */
export async function countCommits(client: GitHubClient, repo: GitHubRepo): Promise<number> {
  try {
    const { data } = await client.repos.listCommits({
      owner: repo.owner,
      repo: repo.name,
      sha: repo.defaultBranch,
      per_page: 2,
    });
    return data.length;
  } catch (error) {
    if (githubStatus(error) === 409) return 0;
    throw error;
  }
}

export interface BranchWait {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

/**
 * The default branch's head commit. Right after `auto_init`, GitHub can briefly answer 404 or 409
 * for the branch, so this waits a little before giving up.
 */
async function branchHead(
  client: GitHubClient,
  repo: GitHubRepo,
  wait: BranchWait,
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { data } = await client.git.getRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${repo.defaultBranch}`,
      });
      return z.object({ object: z.object({ sha: z.string().min(1) }) }).parse(data).object.sha;
    } catch (error) {
      const status = githubStatus(error);
      if ((status !== 404 && status !== 409) || attempt >= wait.attempts) throw error;
      await wait.sleep(wait.delayMs);
    }
  }
}

/**
 * Adds `files` to the default branch as one commit: a tree on top of the head's tree, a commit
 * with the head as parent, then a fast-forward of the branch.
 */
export async function commitFiles(
  client: GitHubClient,
  repo: GitHubRepo,
  files: readonly RepoFile[],
  message: string,
  wait: BranchWait,
): Promise<void> {
  const where = { owner: repo.owner, repo: repo.name };
  const head = await branchHead(client, repo, wait);
  const { data: parent } = await client.git.getCommit({ ...where, commit_sha: head });
  const { data: tree } = await client.git.createTree({
    ...where,
    base_tree: parent.tree.sha,
    tree: files.map((file) => ({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      content: file.content,
    })),
  });
  const { data: commit } = await client.git.createCommit({
    ...where,
    message,
    tree: tree.sha,
    parents: [head],
  });
  await client.git.updateRef({ ...where, ref: `heads/${repo.defaultBranch}`, sha: commit.sha });
}
