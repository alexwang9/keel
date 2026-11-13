import { z } from "zod";
import { HistorySchema } from "@/lib/llm/interview/history";
import { parseJsonBody, type RequestProblem } from "@/lib/request-body";
import type { Result } from "@/lib/result";
import { SpecDraftSchema } from "@/lib/spec/schema";

/** Largest request body accepted, in bytes. A long interview with thinking stays well below it. */
export const MAX_INTERVIEW_BODY_BYTES = 2_000_000;

export const InterviewRequestSchema = z.object({ history: HistorySchema, draft: SpecDraftSchema });

export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;

/** Parses and validates a raw request body. Never throws. */
export const parseInterviewRequest = (body: string): Result<InterviewRequest, RequestProblem> =>
  parseJsonBody(body, InterviewRequestSchema, MAX_INTERVIEW_BODY_BYTES);
