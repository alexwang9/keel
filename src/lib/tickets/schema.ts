import { z } from "zod";
import { nextPrefixedId } from "@/lib/ids";
import { boundedText, prefixedId, reportDuplicates } from "@/lib/validation";

// Worst case (20 checks at 500, a 4000-character description, 20 dependencies) stays far below
// GitHub's 65,536-character issue body limit.
export const LIMITS = {
  shortText: 200,
  longText: 4000,
  checkText: 500,
  tickets: 100,
  acceptanceChecks: 20,
  dependencies: 20,
  proposalOps: 100,
} as const;

export const TICKET_ID_PREFIX = "T";

export const TICKET_SIZES = ["S", "M", "L"] as const;

const shortText = boundedText(LIMITS.shortText);
const longText = boundedText(LIMITS.longText);
const ticketId = prefixedId(TICKET_ID_PREFIX);

export const TicketSchema = z.object({
  id: ticketId,
  title: shortText,
  description: longText,
  acceptanceChecks: z
    .array(boundedText(LIMITS.checkText))
    .min(1, "must have at least one acceptance check")
    .max(LIMITS.acceptanceChecks, `must have at most ${String(LIMITS.acceptanceChecks)} items`),
  size: z.enum(TICKET_SIZES),
  dependsOn: z
    .array(ticketId)
    .max(LIMITS.dependencies, `must have at most ${String(LIMITS.dependencies)} items`)
    .superRefine((ids, ctx) => {
      reportDuplicates(ids, ctx, (id, index) => ({
        path: [index],
        message: `lists ${id} more than once`,
      }));
    }),
});

/**
 * A ticket list with unique ids. Deliberately does not check the dependency graph: an edit may
 * leave it invalid until fixed, and `validateDag` reports what's wrong.
 */
export const TicketListSchema = z
  .array(TicketSchema)
  .max(LIMITS.tickets, `must have at most ${String(LIMITS.tickets)} tickets`)
  .superRefine((tickets, ctx) => {
    reportDuplicates(
      tickets.map((ticket) => ticket.id),
      ctx,
      (id, index) => ({ path: [index, "id"], message: `duplicates id ${id}` }),
    );
  });

const reason = longText;

const UpdateTicketOpSchema = z.object({
  op: z.literal("updateTicket"),
  id: ticketId,
  changes: TicketSchema.pick({ title: true, description: true, acceptanceChecks: true, size: true })
    .partial()
    .refine((changes) => Object.keys(changes).length > 0, "must change at least one field"),
  reason,
});

const dependencyOp = <O extends string>(op: O) =>
  z.object({ op: z.literal(op), ticket: ticketId, dependsOn: ticketId, reason });

const AddTicketOpSchema = z.object({ op: z.literal("addTicket"), ticket: TicketSchema, reason });

const DeleteTicketOpSchema = z.object({ op: z.literal("deleteTicket"), id: ticketId, reason });

/** One proposed change, each with a reason, accepted or rejected individually. */
export const ProposalOpSchema = z.discriminatedUnion("op", [
  UpdateTicketOpSchema,
  dependencyOp("addDependency"),
  dependencyOp("removeDependency"),
  AddTicketOpSchema,
  DeleteTicketOpSchema,
]);

/** An ordered list of ops. Empty is valid: "no changes needed". */
export const ProposalSchema = z
  .array(ProposalOpSchema)
  .max(LIMITS.proposalOps, `must have at most ${String(LIMITS.proposalOps)} ops`);

/** The next free ticket id: one past the highest existing number (`T1`, `T2`, …). */
export const nextTicketId = (tickets: readonly { id: string }[]): string =>
  nextPrefixedId(tickets, TICKET_ID_PREFIX);

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketSize = Ticket["size"];
export type ProposalOp = z.infer<typeof ProposalOpSchema>;
