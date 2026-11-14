import { z } from "zod";

// Repo names: shared by the name step in the browser and the GitHub routes.

const MAX_LENGTH = 100;
const FALLBACK = "keel-project";

/**
 * GitHub's repo name rules: ASCII letters, digits, `.`, `-` and `_`, at most 100 characters, not
 * `.` or `..`, and not ending in `.git`. GitHub quietly rewrites other characters, so Keel refuses
 * them instead of creating a repo under a name the user didn't type.
 */
export const RepoNameSchema = z
  .string()
  .min(1, "Enter a repo name.")
  .max(MAX_LENGTH, `Use at most ${String(MAX_LENGTH)} characters.`)
  .regex(/^[A-Za-z0-9._-]+$/, "Use only letters, digits, dots, hyphens and underscores.")
  .refine((name) => name !== "." && name !== "..", "That name is reserved.")
  .refine((name) => !name.toLowerCase().endsWith(".git"), "A repo name can't end in .git.");

/** The first problem with `name` as readable text, or `null` when it's a valid repo name. */
export function repoNameProblem(name: string): string | null {
  const parsed = RepoNameSchema.safeParse(name);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "That name isn't valid.");
}

const trimEdges = (name: string): string => name.replace(/^[-.]+|[-.]+$/g, "");

/** A repo name from the spec's project name: lowercase, with runs of other characters as `-`. */
export function suggestRepoName(projectName: string): string {
  const slug = trimEdges(
    projectName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, "-")
      .replace(/-{2,}/g, "-"),
  );
  const capped = trimEdges(slug.slice(0, MAX_LENGTH));
  return repoNameProblem(capped) === null ? capped : FALLBACK;
}

/** Names to try when `name` is taken: `name-2`, `name-3`, … (an existing `-N` is replaced). */
export function alternativeRepoNames(name: string, count: number): string[] {
  const base = name.replace(/-\d+$/, "");
  return Array.from({ length: count }, (_, index) => {
    const suffix = `-${String(index + 2)}`;
    return `${trimEdges(base.slice(0, MAX_LENGTH - suffix.length))}${suffix}`;
  });
}

/**
 * `GET /api/github/repo-name`'s answer. A taken name says whether it's a Keel repo (SPEC.md
 * starts with the Keel marker), which the UI offers to resume into, and suggests a free name.
 */
export const NameCheckSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true) }),
  z.object({
    available: z.literal(false),
    keel: z.boolean(),
    suggestion: RepoNameSchema.nullable(),
  }),
]);

export type NameCheck = z.infer<typeof NameCheckSchema>;
