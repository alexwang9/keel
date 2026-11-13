import { z } from "zod";
import { HistorySchema } from "@/lib/llm/interview/history";
import { err, ok, type Result } from "@/lib/result";
import { SpecDraftSchema } from "@/lib/spec/schema";
import { formatIssues } from "@/lib/validation";

/** Largest request body accepted, in bytes. A long interview with thinking stays well below it. */
export const MAX_INTERVIEW_BODY_BYTES = 2_000_000;

export const InterviewRequestSchema = z.object({ history: HistorySchema, draft: SpecDraftSchema });

export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;

export type RequestProblem = { status: 400 | 413; errors: string[] };

/** Parses and validates a raw request body. Never throws. */
export function parseInterviewRequest(body: string): Result<InterviewRequest, RequestProblem> {
  if (new TextEncoder().encode(body).byteLength > MAX_INTERVIEW_BODY_BYTES) {
    return err({ status: 413, errors: ["request body is too large"] });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return err({ status: 400, errors: ["request body is not valid JSON"] });
  }
  const parsed = InterviewRequestSchema.safeParse(json);
  if (!parsed.success) return err({ status: 400, errors: formatIssues(parsed.error.issues) });
  return ok(parsed.data);
}
