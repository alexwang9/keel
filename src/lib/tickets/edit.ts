import { nextPrefixedId } from "@/lib/ids";
import { err, ok, type Result } from "@/lib/result";
import { topoSort, type DagError } from "@/lib/tickets/dag";
import { TICKET_ID_PREFIX, TicketListSchema, type Ticket } from "@/lib/tickets/schema";
import { formatIssues } from "@/lib/validation";

/**
 * Topological order when the graph is valid. An invalid graph keeps the order given, so a list
 * mid-fix doesn't jump around.
 */
function ordered(tickets: Ticket[]): Ticket[] {
  const sorted = topoSort(tickets);
  return sorted.ok ? sorted.value : tickets;
}

function checked(tickets: Ticket[]): Result<Ticket[], string[]> {
  const parsed = TicketListSchema.safeParse(tickets);
  if (!parsed.success) return err(formatIssues(parsed.error.issues, "tickets"));
  return ok(ordered(parsed.data));
}

/**
 * Replaces the ticket with the same id, or adds it at the end. Fails on an invalid ticket or list,
 * but not on dependency problems: `validateDag` reports those.
 */
export function saveTicket(tickets: readonly Ticket[], ticket: Ticket): Result<Ticket[], string[]> {
  const exists = tickets.some((other) => other.id === ticket.id);
  const next = exists
    ? tickets.map((other) => (other.id === ticket.id ? ticket : other))
    : [...tickets, ticket];
  return checked(next);
}

/**
 * Removes a ticket. Dependencies on it are left in place, so the graph reports them until they
 * are fixed rather than being silently rewired.
 */
export function deleteTicket(tickets: readonly Ticket[], id: string): Result<Ticket[], string[]> {
  if (!tickets.some((ticket) => ticket.id === id)) return err([`there is no ticket ${id}`]);
  return checked(tickets.filter((ticket) => ticket.id !== id));
}

/** The tickets that depend on `id`, in list order. */
export const dependentsOf = (tickets: readonly Ticket[], id: string): Ticket[] =>
  tickets.filter((ticket) => ticket.dependsOn.includes(id));

/**
 * The id for a new ticket. Skips every id still in use: by a ticket, by a dependency that points
 * at a deleted ticket, or by the checked list. Otherwise a dangling `T7` would quietly start
 * pointing at the new ticket.
 */
export function newTicketId(tickets: readonly Ticket[], checkedTickets: readonly Ticket[]): string {
  const ids = [...tickets, ...checkedTickets].flatMap((ticket) => [ticket.id, ...ticket.dependsOn]);
  return nextPrefixedId(
    ids.map((id) => ({ id })),
    TICKET_ID_PREFIX,
  );
}

/** Each ticket's dependency errors, so they can be shown on the tickets involved. */
export function dagErrorsByTicket(errors: readonly DagError[]): Map<string, DagError[]> {
  const byTicket = new Map<string, DagError[]>();
  for (const error of errors) {
    const ids = error.kind === "cycle" ? new Set(error.path) : [error.ticket];
    for (const id of ids) byTicket.set(id, [...(byTicket.get(id) ?? []), error]);
  }
  return byTicket;
}

// Dependencies are a set: unticking and reticking one in the picker isn't an edit.
const comparable = (ticket: Ticket): string =>
  JSON.stringify({ ...ticket, dependsOn: [...ticket.dependsOn].sort() });

const sameTicket = (a: Ticket, b: Ticket): boolean => comparable(a) === comparable(b);

/**
 * The ids added, changed or deleted since `checkedTickets`, sorted. List order alone isn't a
 * change. Both lists went through the same schema parse, so their keys are in the same order.
 */
export function uncheckedTicketIds(
  checkedTickets: readonly Ticket[],
  tickets: readonly Ticket[],
): string[] {
  const before = new Map(checkedTickets.map((ticket) => [ticket.id, ticket]));
  const after = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids]
    .filter((id) => {
      const a = before.get(id);
      const b = after.get(id);
      return !a || !b || !sameTicket(a, b);
    })
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
