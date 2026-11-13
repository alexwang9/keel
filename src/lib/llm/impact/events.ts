import { z } from "zod";
import { LLM_ERROR_CODES } from "@/lib/llm/error-codes";
import { InvalidEventSchema } from "@/lib/llm/repair";
import { ProposalSchema } from "@/lib/tickets/schema";

export const IMPACT_ERROR_CODES = [...LLM_ERROR_CODES, "invalid_output", "timeout"] as const;

export const ImpactErrorSchema = z.object({
  code: z.enum(IMPACT_ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
});

/**
 * Events streamed by `POST /api/tickets/impact`. Like ticket generation, one request makes one
 * model call, and `invalid` hands a failed proposal back for the client's one repair request.
 * `complete` carries the proposal; an empty one means no changes are needed.
 */
export const ImpactEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started") }),
  z.object({ type: z.literal("thinking") }),
  z.object({ type: z.literal("validating") }),
  InvalidEventSchema,
  z.object({ type: z.literal("complete"), ops: ProposalSchema }),
  z.object({ type: z.literal("error"), error: ImpactErrorSchema }),
]);

export type ImpactError = z.infer<typeof ImpactErrorSchema>;
export type ImpactErrorCode = ImpactError["code"];
export type ImpactEvent = z.infer<typeof ImpactEventSchema>;
