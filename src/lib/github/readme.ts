import { document, normalize, oneLine } from "@/lib/markdown";
import type { Spec } from "@/lib/spec/schema";

/** The minimal README.md committed alongside SPEC.md. Deterministic, like SPEC.md. */
export function renderReadme(spec: Spec): string {
  return document([
    `# ${oneLine(spec.name)}`,
    normalize(spec.goal),
    [
      "- [SPEC.md](SPEC.md): what this project is, its features and their acceptance checks",
      "- [docs/interview.md](docs/interview.md): the interview the spec came from",
      "- [Issues](../../issues): the work, one ticket per issue, with `Depends on #N` links",
    ].join("\n"),
    "_Planned with Keel._",
  ]);
}

// GitHub's limit on a repo description.
const DESCRIPTION_LIMIT = 350;

/** The repo description: the goal on one line, cut to GitHub's limit. */
export function repoDescription(spec: Spec): string {
  const goal = oneLine(spec.goal);
  return goal.length <= DESCRIPTION_LIMIT ? goal : `${goal.slice(0, DESCRIPTION_LIMIT - 1)}…`;
}
