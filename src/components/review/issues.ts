import type { z } from "zod";

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Validates a form value with a spec schema and returns readable messages, e.g.
 * `Feature acceptance check 2 must not be empty`. `labels` names path segments; list positions
 * are shown counting from 1.
 */
export function issuesFor(
  schema: z.ZodType,
  value: unknown,
  root: string,
  labels: Record<string, string> = {},
): string[] {
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.map((segment) =>
      typeof segment === "number"
        ? String(segment + 1)
        : (labels[String(segment)] ?? String(segment)),
    );
    return capitalize([root, ...path, issue.message].join(" "));
  });
}
