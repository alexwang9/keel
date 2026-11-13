import { z } from "zod";
import { RepairSchema } from "@/lib/llm/repair";
import { parseJsonBody, type RequestProblem } from "@/lib/request-body";
import type { Result } from "@/lib/result";
import { SpecSchema } from "@/lib/spec/schema";
import { uncheckedTicketIds } from "@/lib/tickets/edit";
import { TicketListSchema } from "@/lib/tickets/schema";

/**
 * Largest request body accepted, in bytes: two lists at the schema's limits plus a spec and a
 * failed output to repair, below Vercel's 4.5 MB request limit.
 */
export const MAX_IMPACT_BODY_BYTES = 4_000_000;

/**
 * The approved spec, the tickets as of the last check, and the current tickets. The server works
 * out the edits from the two lists, so the summary always matches them. `repair` is set on the
 * one automatic retry after `invalid`.
 */
export const ImpactRequestSchema = z
  .object({
    spec: SpecSchema,
    checked: TicketListSchema,
    tickets: TicketListSchema,
    repair: RepairSchema.optional(),
  })
  .refine((body) => uncheckedTicketIds(body.checked, body.tickets).length > 0, {
    message: "there are no edits to check",
    path: ["tickets"],
  });

export type ImpactRequest = z.infer<typeof ImpactRequestSchema>;

/** Parses and validates a raw request body. Never throws. */
export const parseImpactRequest = (body: string): Result<ImpactRequest, RequestProblem> =>
  parseJsonBody(body, ImpactRequestSchema, MAX_IMPACT_BODY_BYTES);
