import type { Ticket } from "@/lib/tickets/schema";

/** A valid ticket with defaults, for tests that care only about ids and dependencies. */
export const ticket = (id: string, dependsOn: string[] = [], overrides: Partial<Ticket> = {}) =>
  ({
    id,
    title: `Ticket ${id}`,
    description: `Implements ${id}.`,
    acceptanceChecks: [`${id} works.`],
    size: "M",
    dependsOn,
    ...overrides,
  }) satisfies Ticket;

/**
 * A small valid DAG in topological order, for the Shelf spec fixture:
 * T1 ← T2 ← T4, T1 ← T3 ← T4.
 */
export const shelfTickets: Ticket[] = [
  ticket("T1", [], {
    title: "Club with a shared reading list",
    description: "Create a club and show its reading list.\n\nEmpty state when no books exist.",
    acceptanceChecks: ["A new club shows an empty reading list.", "The list survives a reload."],
    size: "M",
  }),
  ticket("T2", ["T1"], {
    title: "Add a book",
    description: "Add a book by title and author.",
    acceptanceChecks: ["A member can add a book.", "A book without a title is rejected."],
    size: "S",
  }),
  ticket("T3", ["T1"], {
    title: "Book status",
    description: "Mark a book read, reading or proposed.",
    acceptanceChecks: ["Each book shows its status."],
    size: "S",
  }),
  ticket("T4", ["T2", "T3"], {
    title: "Vote on the next book",
    description: "Members vote on proposed books; the organiser closes the vote.",
    acceptanceChecks: ["A member can vote once per round.", "Closing the vote picks the winner."],
    size: "L",
  }),
];

/** `T1 ← T2 ← … ← Tn`: each ticket depends on the previous one. */
export const chain = (length: number): Ticket[] =>
  Array.from({ length }, (_, index) =>
    ticket(`T${String(index + 1)}`, index === 0 ? [] : [`T${String(index)}`]),
  );
