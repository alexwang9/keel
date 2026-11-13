import { describe, expect, it } from "vitest";
import { describeTicketEdits } from "@/lib/tickets/describe";
import type { Ticket } from "@/lib/tickets/schema";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const [t1, t2, t3, t4] = shelfTickets as [Ticket, Ticket, Ticket, Ticket];

describe("describeTicketEdits", () => {
  it("is empty when nothing changed, including a reorder", () => {
    expect(describeTicketEdits(shelfTickets, [...shelfTickets].reverse())).toEqual([]);
  });

  it("describes an added ticket in full", () => {
    const added = ticket("T5", ["T4"], { title: "Export", acceptanceChecks: ["CSV downloads."] });
    expect(describeTicketEdits(shelfTickets, [...shelfTickets, added])).toEqual([
      'Added T5 "Export":',
      "  Size: M",
      "  Depends on: T4",
      '  Description: "Implements T5."',
      "  Acceptance checks:",
      '  - "CSV downloads."',
    ]);
  });

  it("names a deleted ticket", () => {
    expect(describeTicketEdits(shelfTickets, [t1, t2, t4])).toEqual(['Deleted T3 "Book status".']);
  });

  it("lists only the fields that changed, old and new", () => {
    const edited = { ...t2, title: "Add a book by ISBN", size: "M" as const };
    expect(describeTicketEdits(shelfTickets, [t1, edited, t3, t4])).toEqual([
      'Changed T2 "Add a book by ISBN":',
      '  Title: "Add a book" → "Add a book by ISBN"',
      "  Size: S → M",
    ]);
  });

  it("shows description, checks and dependency changes", () => {
    const edited = {
      ...t4,
      description: "Ranked voting.",
      acceptanceChecks: ["Members rank books."],
      dependsOn: ["T2", "T1"],
    };
    expect(describeTicketEdits(shelfTickets, [t1, t2, t3, edited])).toEqual([
      'Changed T4 "Vote on the next book":',
      `  Description was: ${JSON.stringify(t4.description)}`,
      '  Description is now: "Ranked voting."',
      "  Acceptance checks were:",
      ...t4.acceptanceChecks.map((check) => `  - ${JSON.stringify(check)}`),
      "  Acceptance checks are now:",
      '  - "Members rank books."',
      "  Now also depends on: T1",
      "  No longer depends on: T3",
    ]);
  });

  it("orders several edits by id", () => {
    const lines = describeTicketEdits(shelfTickets, [
      { ...t3, size: "L" },
      t2,
      ticket("T10"),
      { ...t1, size: "S" },
    ]);
    const heads = lines.filter((line) => !line.startsWith("  "));
    expect(heads).toEqual([
      'Changed T1 "Club with a shared reading list":',
      'Changed T3 "Book status":',
      'Deleted T4 "Vote on the next book".',
      'Added T10 "Ticket T10":',
    ]);
  });
});
