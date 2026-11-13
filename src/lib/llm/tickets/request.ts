import { z } from "zod";
import { RepairSchema } from "@/lib/llm/tickets/events";
import { parseJsonBody, type RequestProblem } from "@/lib/request-body";
import type { Result } from "@/lib/result";
import { SpecSchema } from "@/lib/spec/schema";

/** Largest request body accepted, in bytes: a large spec plus a failed output to repair. */
export const MAX_TICKET_BODY_BYTES = 1_000_000;

/** `repair` is set on the one automatic retry after `invalid`. */
export const TicketRequestSchema = z.object({ spec: SpecSchema, repair: RepairSchema.optional() });

export type TicketRequest = z.infer<typeof TicketRequestSchema>;

/** Parses and validates a raw request body. Never throws. */
export const parseTicketRequest = (body: string): Result<TicketRequest, RequestProblem> =>
  parseJsonBody(body, TicketRequestSchema, MAX_TICKET_BODY_BYTES);
