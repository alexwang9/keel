import { err, type Result } from "@/lib/result";
import { uncheckedTicketIds } from "@/lib/tickets/edit";
import { applyProposalOps } from "@/lib/tickets/proposal";
import type { ProposalOp, Ticket } from "@/lib/tickets/schema";

// Reviewing an impact proposal: each op is accepted or rejected, and the result is previewed.

export type Decision = "accept" | "reject";

/** One decision per op, by position; `undefined` until the user decides. */
export type Decisions = readonly (Decision | undefined)[];

const FIELD_NAMES = {
  title: "title",
  description: "description",
  acceptanceChecks: "acceptance checks",
  size: "size",
} as const;

const titled = (tickets: readonly Ticket[], id: string): string => {
  const ticket = tickets.find((other) => other.id === id);
  return ticket ? `${id} "${ticket.title}"` : id;
};

/** A one-line description of an op, for the user to decide on. */
export function describeOp(op: ProposalOp, tickets: readonly Ticket[]): string {
  switch (op.op) {
    case "updateTicket": {
      const fields = Object.keys(op.changes).map(
        (key) => FIELD_NAMES[key as keyof typeof FIELD_NAMES],
      );
      return `Change the ${fields.join(", ")} of ${titled(tickets, op.id)}`;
    }
    case "addDependency":
      return `Make ${op.ticket} depend on ${op.dependsOn}`;
    case "removeDependency":
      return `Stop ${op.ticket} depending on ${op.dependsOn}`;
    case "addTicket":
      return `Add ${op.ticket.id} "${op.ticket.title}"`;
    case "deleteTicket":
      return `Delete ${titled(tickets, op.id)}`;
  }
}

/** True once every op has a decision. */
export const allDecided = (ops: readonly ProposalOp[], decisions: Decisions): boolean =>
  ops.every((_, index) => decisions[index] !== undefined);

// `applyProposalOps` names ops by their position among the accepted ones.
const OP_ERROR = /^ops\.(\d+) (.*)$/;

/**
 * Applies the accepted ops, in proposal order, to `tickets`. Fails with readable errors when the
 * accepted combination can't be applied or leaves the dependencies invalid; op errors name the
 * change by its number in the proposal.
 */
export function previewProposal(
  tickets: readonly Ticket[],
  ops: readonly ProposalOp[],
  decisions: Decisions,
): Result<Ticket[], string[]> {
  const accepted = ops.flatMap((op, index) =>
    decisions[index] === "accept" ? [{ op, number: index + 1 }] : [],
  );
  const result = applyProposalOps(
    tickets,
    accepted.map(({ op }) => op),
  );
  if (result.ok) return result;
  return err(
    result.error.map((error) => {
      const match = OP_ERROR.exec(error);
      const number = match ? accepted[Number(match[1])]?.number : undefined;
      return number === undefined
        ? error
        : `Change ${String(number)} can't be applied: ${match?.[2] ?? ""}.`;
    }),
  );
}

export interface PreviewChanges {
  added: string[];
  changed: string[];
  deleted: string[];
}

/** Which tickets applying would add, change or delete, by id. */
export function previewChanges(
  before: readonly Ticket[],
  after: readonly Ticket[],
): PreviewChanges {
  const beforeIds = new Set(before.map((ticket) => ticket.id));
  const afterIds = new Set(after.map((ticket) => ticket.id));
  const ids = uncheckedTicketIds(before, after);
  return {
    added: ids.filter((id) => !beforeIds.has(id)),
    changed: ids.filter((id) => beforeIds.has(id) && afterIds.has(id)),
    deleted: ids.filter((id) => !afterIds.has(id)),
  };
}

/** The accepted ops, in proposal order. */
export const acceptedOps = (ops: readonly ProposalOp[], decisions: Decisions): ProposalOp[] =>
  ops.filter((_, index) => decisions[index] === "accept");
