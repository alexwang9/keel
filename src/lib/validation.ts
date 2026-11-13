import type { z } from "zod";

/** Formats Zod issues as `path message` strings, e.g. `ops.0.item.id must look like F1, F2, …`. */
export function formatIssues(issues: readonly z.core.$ZodIssue[], root?: string): string[] {
  return issues.map((issue) => {
    const path = [...(root === undefined ? [] : [root]), ...issue.path.map(String)].join(".");
    return path === "" ? issue.message : `${path} ${issue.message}`;
  });
}
