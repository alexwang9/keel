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

/** Trims every string in a form value, so an unchanged form isn't saved as an edit. */
export function trimDeep<T>(value: T): T {
  if (typeof value === "string") return value.trim() as T;
  if (Array.isArray(value)) return value.map(trimDeep) as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimDeep(v)])) as T;
  }
  return value;
}
