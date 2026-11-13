import type { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { formatIssues } from "@/lib/validation";

export type RequestProblem = { status: 400 | 413; errors: string[] };

/** Parses a raw JSON request body against `schema`, refusing it above `maxBytes`. Never throws. */
export function parseJsonBody<S extends z.ZodType>(
  body: string,
  schema: S,
  maxBytes: number,
): Result<z.infer<S>, RequestProblem> {
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    return err({ status: 413, errors: ["request body is too large"] });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return err({ status: 400, errors: ["request body is not valid JSON"] });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return err({ status: 400, errors: formatIssues(parsed.error.issues) });
  return ok(parsed.data);
}
