import { z } from "zod";

/** Formats Zod issues as `path message` strings, e.g. `ops.0.item.id must look like F1, F2, …`. */
export function formatIssues(issues: readonly z.core.$ZodIssue[], root?: string): string[] {
  return issues.map((issue) => {
    const path = [...(root === undefined ? [] : [root]), ...issue.path.map(String)].join(".");
    return path === "" ? issue.message : `${path} ${issue.message}`;
  });
}

/** Trimmed, non-empty text of at most `max` characters. */
export const boundedText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be at most ${String(max)} characters`);

/** A schema for ids like `F1`…`F9999`: the prefix, then a number without leading zeros. */
export const prefixedId = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}[1-9]\\d{0,3}$`), `must look like ${prefix}1, ${prefix}2, …`);

/** Adds one issue per repeated value, at the repeat's position, built by `issueFor`. */
export function reportDuplicates(
  values: readonly string[],
  ctx: z.core.$RefinementCtx,
  issueFor: (value: string, index: number) => { path: PropertyKey[]; message: string },
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) ctx.addIssue({ code: "custom", ...issueFor(value, index) });
    seen.add(value);
  });
}
