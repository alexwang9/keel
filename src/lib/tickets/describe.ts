import { uncheckedTicketIds } from "@/lib/tickets/edit";
import type { Ticket } from "@/lib/tickets/schema";

// Plain-text descriptions of tickets and of what changed, for the impact prompt.

const quote = (text: string): string => JSON.stringify(text);

const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(", ") : "none");

/** A whole ticket as indented lines. */
function ticketLines(ticket: Ticket): string[] {
  return [
    `  Size: ${ticket.size}`,
    `  Depends on: ${list(ticket.dependsOn)}`,
    `  Description: ${quote(ticket.description)}`,
    "  Acceptance checks:",
    ...ticket.acceptanceChecks.map((check) => `  - ${quote(check)}`),
  ];
}

const sameChecks = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((check, index) => check === b[index]);

/** One line per changed field, with old and new values. */
function changeLines(before: Ticket, after: Ticket): string[] {
  const lines: string[] = [];
  if (before.title !== after.title) {
    lines.push(`  Title: ${quote(before.title)} → ${quote(after.title)}`);
  }
  if (before.size !== after.size) lines.push(`  Size: ${before.size} → ${after.size}`);
  if (before.description !== after.description) {
    lines.push(`  Description was: ${quote(before.description)}`);
    lines.push(`  Description is now: ${quote(after.description)}`);
  }
  if (!sameChecks(before.acceptanceChecks, after.acceptanceChecks)) {
    lines.push(
      "  Acceptance checks were:",
      ...before.acceptanceChecks.map((c) => `  - ${quote(c)}`),
    );
    lines.push(
      "  Acceptance checks are now:",
      ...after.acceptanceChecks.map((c) => `  - ${quote(c)}`),
    );
  }
  const added = after.dependsOn.filter((id) => !before.dependsOn.includes(id));
  const removed = before.dependsOn.filter((id) => !after.dependsOn.includes(id));
  if (added.length > 0) lines.push(`  Now also depends on: ${added.join(", ")}`);
  if (removed.length > 0) lines.push(`  No longer depends on: ${removed.join(", ")}`);
  return lines;
}

function describeOne(id: string, before: Ticket | undefined, after: Ticket | undefined): string[] {
  if (before && after)
    return [`Changed ${id} ${quote(after.title)}:`, ...changeLines(before, after)];
  if (after) return [`Added ${id} ${quote(after.title)}:`, ...ticketLines(after)];
  if (before) return [`Deleted ${id} ${quote(before.title)}.`];
  return [];
}

/**
 * What the user changed since `checked`, ticket by ticket in id order, with full new values so
 * the reader needs nothing else. Empty when nothing changed.
 */
export function describeTicketEdits(
  checked: readonly Ticket[],
  tickets: readonly Ticket[],
): string[] {
  const before = new Map(checked.map((ticket) => [ticket.id, ticket]));
  const after = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  return uncheckedTicketIds(checked, tickets).flatMap((id) =>
    describeOne(id, before.get(id), after.get(id)),
  );
}
