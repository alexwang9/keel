import { RepoNameSchema } from "@/lib/github/repo-name";
import { err, ok, type Result } from "@/lib/result";

// Which repo to graph: shared by the graph page's form and `GET /api/github/graph`.

export interface RepoRef {
  owner: string;
  name: string;
}

/** GitHub's login rules: letters, digits and single hyphens, not at either end, at most 39. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

const INVALID = "Enter a GitHub repo as owner/name or its github.com URL.";

/**
 * Reads `owner/name` or a github.com repo URL. A trailing `.git`, slash, query or deeper path
 * (such as `/issues`) is ignored, so a link copied from any repo page works.
 */
export function parseRepoRef(input: string): Result<RepoRef, string> {
  const path = input.trim().replace(GITHUB_URL, "").split(/[?#]/)[0] ?? "";
  const [owner = "", rawName = "", ...rest] = path.split("/");
  // Bare `owner/name/extra` is ambiguous; only a URL may carry a deeper path.
  if (rest.some((part) => part !== "") && !GITHUB_URL.test(input.trim())) return err(INVALID);
  const name = rawName.replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !RepoNameSchema.safeParse(name).success) return err(INVALID);
  return ok({ owner, name });
}

export const formatRepoRef = (ref: RepoRef): string => `${ref.owner}/${ref.name}`;

/** The graph page's path for a repo, mirroring github.com/owner/name. */
export const graphPath = ({ owner, name }: RepoRef): string =>
  `/app/graph/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
