import { err, ok, type Result } from "@/lib/result";
import { formatDagError, validateDag } from "@/lib/tickets/dag";
import {
  ProposalSchema,
  TicketListSchema,
  type ProposalOp,
  type Ticket,
} from "@/lib/tickets/schema";
import { formatIssues } from "@/lib/validation";

type DependencyOp = Extract<ProposalOp, { op: "addDependency" | "removeDependency" }>;

/** Replaces the ticket with `id` using `change`, or fails if there is none. */
function updateById(
  tickets: readonly Ticket[],
  id: string,
  change: (ticket: Ticket) => Result<Ticket, string>,
): Result<Ticket[], string> {
  const index = tickets.findIndex((ticket) => ticket.id === id);
  const current = tickets[index];
  if (!current) return err(`no ticket with id ${id}`);
  const changed = change(current);
  return changed.ok ? ok(tickets.with(index, changed.value)) : changed;
}

function applyDependencyOp(tickets: readonly Ticket[], op: DependencyOp): Result<Ticket[], string> {
  return updateById(tickets, op.ticket, (ticket) => {
    const has = ticket.dependsOn.includes(op.dependsOn);
    if (op.op === "addDependency") {
      if (has) return err(`${ticket.id} already depends on ${op.dependsOn}`);
      return ok({ ...ticket, dependsOn: [...ticket.dependsOn, op.dependsOn] });
    }
    if (!has) return err(`${ticket.id} does not depend on ${op.dependsOn}`);
    return ok({ ...ticket, dependsOn: ticket.dependsOn.filter((id) => id !== op.dependsOn) });
  });
}

function applyOp(tickets: readonly Ticket[], op: ProposalOp): Result<Ticket[], string> {
  switch (op.op) {
    case "updateTicket":
      return updateById(tickets, op.id, (ticket) => ok({ ...ticket, ...op.changes }));
    case "addDependency":
    case "removeDependency":
      return applyDependencyOp(tickets, op);
    case "addTicket":
      if (tickets.some((ticket) => ticket.id === op.ticket.id)) {
        return err(`ticket ${op.ticket.id} already exists`);
      }
      return ok([...tickets, op.ticket]);
    case "deleteTicket":
      if (!tickets.some((ticket) => ticket.id === op.id)) return err(`no ticket with id ${op.id}`);
      // Edges into the deleted ticket stay, so a delete that others still need is blocked below.
      return ok(tickets.filter((ticket) => ticket.id !== op.id));
  }
}

/**
 * Applies the proposal ops the user accepted. Ops are untrusted (they come from the LLM via the
 * client), run in order and all-or-nothing: on any error the tickets are unchanged and every
 * error is returned. The result must be a valid ticket list and a valid DAG, so an accepted
 * combination that breaks the graph (say, deleting a ticket others depend on) is blocked with
 * an explanation. An empty list of ops is valid and re-checks the current tickets.
 */
export function applyProposalOps(
  tickets: readonly Ticket[],
  ops: unknown,
): Result<Ticket[], string[]> {
  const parsed = ProposalSchema.safeParse(ops);
  if (!parsed.success) return err(formatIssues(parsed.error.issues, "ops"));

  let next: readonly Ticket[] = tickets;
  for (const [index, op] of parsed.data.entries()) {
    const result = applyOp(next, op);
    if (!result.ok) return err([`ops.${String(index)} ${result.error}`]);
    next = result.value;
  }

  const validated = TicketListSchema.safeParse(next);
  if (!validated.success) return err(formatIssues(validated.error.issues, "tickets"));
  const dag = validateDag(validated.data);
  if (!dag.ok) return err(dag.error.map(formatDagError));
  return ok(validated.data);
}
