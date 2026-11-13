import { z } from "zod";
import { HistoryMessageSchema } from "@/lib/llm/interview/history";
import { SpecDraftSchema, SpecOpSchema, SpecSchema } from "@/lib/spec/schema";

export const INTERVIEW_ERROR_CODES = [
  "rate_limited",
  "overloaded",
  "connection",
  "bad_request",
  "server_config",
  "refusal",
  "max_tokens",
  "loop_limit",
  "unknown",
] as const;

export const InterviewErrorSchema = z.object({
  code: z.enum(INTERVIEW_ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
});

/**
 * Events streamed by `POST /api/interview`. `text` deltas are provisional until a `turn` event
 * commits them: on `error`, the client drops text it received after the last `turn`, so the stored
 * history always ends at a consistent point and a retry can resend it as is.
 */
export const InterviewEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("specPatch"), ops: z.array(SpecOpSchema), draft: SpecDraftSchema }),
  z.object({ type: z.literal("turn"), messages: z.array(HistoryMessageSchema) }),
  z.object({ type: z.literal("complete"), spec: SpecSchema }),
  z.object({ type: z.literal("error"), error: InterviewErrorSchema }),
]);

export type InterviewError = z.infer<typeof InterviewErrorSchema>;
export type InterviewErrorCode = InterviewError["code"];
export type InterviewEvent = z.infer<typeof InterviewEventSchema>;
