import type { ProposalOp, Ticket } from "@/lib/tickets/schema";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const [t1, t2, , t4] = shelfTickets as [Ticket, Ticket, Ticket, Ticket];

/** The user deleted T3 "Book status", which T4 still depends on. */
export const checkedTickets: Ticket[] = shelfTickets;
export const editedTickets: Ticket[] = [t1, t2, t4];

const reason = "T3 was deleted.";

/** A valid fix: drop the dangling dependency, and move T3's work into a new T5. */
export const fixOps: ProposalOp[] = [
  { op: "removeDependency", ticket: "T4", dependsOn: "T3", reason },
  {
    op: "addTicket",
    ticket: ticket("T5", ["T1"], { title: "Track reading status" }),
    reason: "Status tracking still has to live somewhere.",
  },
  { op: "addDependency", ticket: "T4", dependsOn: "T5", reason: "Voting needs a book's status." },
  { op: "updateTicket", id: "T4", changes: { size: "M" }, reason: "Smaller without status work." },
];
