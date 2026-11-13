import { z } from "zod";
import { LLM_ERROR_CODES } from "@/lib/llm/error-codes";
import { TicketListSchema } from "@/lib/tickets/schema";

export const TICKET_ERROR_CODES = [...LLM_ERROR_CODES, "invalid_output", "timeout"] as const;

export const TicketErrorSchema = z.object({
  code: z.enum(TICKET_ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
});

/** Largest model output passed back for repair, in characters. 64k tokens stays well below it. */
export const MAX_REPAIR_OUTPUT_CHARS = 400_000;
/** Validation errors passed back for repair. More than this adds noise, not information. */
export const MAX_REPAIR_ERRORS = 30;

const repairError = z.string().min(1).max(1000);

/**
 * Events streamed by `POST /api/tickets/generate`. Progress events carry no ticket text. One
 * request makes one model call: `invalid` hands the output and its errors back to the client,
 * which sends them in a repair request (each request gets its own function time limit).
 */
export const TicketEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started") }),
  z.object({ type: z.literal("thinking") }),
  // Tickets seen so far in the streamed output. A progress hint, not a parse.
  z.object({ type: z.literal("drafting"), count: z.int().nonnegative() }),
  z.object({ type: z.literal("validating") }),
  z.object({
    type: z.literal("invalid"),
    output: z.string().max(MAX_REPAIR_OUTPUT_CHARS),
    errors: z.array(repairError).min(1).max(MAX_REPAIR_ERRORS),
  }),
  z.object({ type: z.literal("complete"), tickets: TicketListSchema }),
  z.object({ type: z.literal("error"), error: TicketErrorSchema }),
]);

export const RepairSchema = z.object({
  output: z.string().min(1).max(MAX_REPAIR_OUTPUT_CHARS),
  errors: z.array(repairError).min(1).max(MAX_REPAIR_ERRORS),
});

export type TicketError = z.infer<typeof TicketErrorSchema>;
export type TicketErrorCode = TicketError["code"];
export type TicketEvent = z.infer<typeof TicketEventSchema>;
export type Repair = z.infer<typeof RepairSchema>;
