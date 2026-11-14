import "server-only";
import type { GitHubClient } from "@/lib/github/client";
import { alternativeRepoNames, type NameCheck } from "@/lib/github/repo-name";
import { findRepo, readFile } from "@/lib/github/repo";
import { SPEC_MARKER } from "@/lib/spec/render";

/** How many `name-N` alternatives to try before giving up on a suggestion. */
export const SUGGESTION_ATTEMPTS = 5;

/**
 * Whether `login` can create `name`. A private repo with the name is invisible to `public_repo`
 * and reads as available; creation then fails with `name_taken`. Throws Octokit errors.
 */
export async function checkRepoName(
  client: GitHubClient,
  login: string,
  name: string,
): Promise<NameCheck> {
  const existing = await findRepo(client, login, name);
  if (!existing) return { available: true };
  const spec = await readFile(client, existing, "SPEC.md");
  let suggestion: string | null = null;
  for (const candidate of alternativeRepoNames(name, SUGGESTION_ATTEMPTS)) {
    if (!(await findRepo(client, login, candidate))) {
      suggestion = candidate;
      break;
    }
  }
  return { available: false, keel: spec?.startsWith(SPEC_MARKER) === true, suggestion };
}
