import { describe, expect, it } from "vitest";
import { nextTicketId, ProposalSchema, TicketListSchema, TicketSchema } from "@/lib/tickets/schema";
import { formatIssues } from "@/lib/validation";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

function issuesFor(schema: typeof TicketSchema | typeof TicketListSchema, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected the input to be rejected");
  return formatIssues(result.error.issues);
}

describe("TicketSchema", () => {
  it("accepts and trims a valid ticket", () => {
    const parsed = TicketSchema.parse(ticket("T1", [], { title: "  Sign in  " }));

    expect(parsed.title).toBe("Sign in");
  });

  it("requires at least one acceptance check", () => {
    expect(issuesFor(TicketSchema, ticket("T1", [], { acceptanceChecks: [] }))).toEqual([
      "acceptanceChecks must have at least one acceptance check",
    ]);
  });

  it("caps each acceptance check at 500 characters", () => {
    const long = ticket("T1", [], { acceptanceChecks: ["x".repeat(501)] });

    expect(issuesFor(TicketSchema, long)).toEqual([
      "acceptanceChecks.0 must be at most 500 characters",
    ]);
  });

  it("rejects bad ids, sizes and repeated dependencies", () => {
    const bad = { ...ticket("T01", ["T2", "F1", "T2"]), size: "XL" };

    expect(issuesFor(TicketSchema, bad)).toEqual([
      "id must look like T1, T2, …",
      'size Invalid option: expected one of "S"|"M"|"L"',
      "dependsOn.1 must look like T1, T2, …",
      "dependsOn.2 lists T2 more than once",
    ]);
  });

  it("caps dependencies at 20", () => {
    const deps = Array.from({ length: 21 }, (_, index) => `T${String(index + 2)}`);

    expect(issuesFor(TicketSchema, ticket("T1", deps))).toEqual([
      "dependsOn must have at most 20 items",
    ]);
  });
});

describe("TicketListSchema", () => {
  it("accepts a list whose dependency graph is invalid", () => {
    expect(TicketListSchema.safeParse([ticket("T1", ["T9"]), ticket("T2", ["T2"])]).success).toBe(
      true,
    );
  });

  it("rejects duplicate ids", () => {
    expect(issuesFor(TicketListSchema, [...shelfTickets, ticket("T2")])).toEqual([
      "4.id duplicates id T2",
    ]);
  });

  it("caps the list at 100 tickets", () => {
    const tickets = Array.from({ length: 101 }, (_, index) => ticket(`T${String(index + 1)}`));

    expect(issuesFor(TicketListSchema, tickets)).toEqual(["must have at most 100 tickets"]);
  });
});

describe("ProposalSchema", () => {
  it("accepts an empty proposal and every op kind", () => {
    const reason = "Because.";
    const ops = [
      { op: "updateTicket", id: "T1", changes: { size: "L" }, reason },
      { op: "addDependency", ticket: "T3", dependsOn: "T2", reason },
      { op: "removeDependency", ticket: "T4", dependsOn: "T2", reason },
      { op: "addTicket", ticket: ticket("T5", ["T4"]), reason },
      { op: "deleteTicket", id: "T5", reason },
    ];

    expect(ProposalSchema.safeParse([]).success).toBe(true);
    expect(ProposalSchema.parse(ops)).toHaveLength(5);
  });

  it.each([
    ["changes nothing", {}],
    // Dependencies change only through add/removeDependency; the key is stripped, leaving nothing.
    ["only touches dependencies", { dependsOn: ["T2"] }],
  ])("rejects an update that %s", (_label, changes) => {
    const result = ProposalSchema.safeParse([
      { op: "updateTicket", id: "T1", changes, reason: "x" },
    ]);

    expect(result.error && formatIssues(result.error.issues)).toEqual([
      "0.changes must change at least one field",
    ]);
  });

  it("requires a reason", () => {
    expect(ProposalSchema.safeParse([{ op: "deleteTicket", id: "T1" }]).success).toBe(false);
  });
});

describe("nextTicketId", () => {
  it("is one past the highest ticket number", () => {
    expect(nextTicketId([])).toBe("T1");
    expect(nextTicketId([{ id: "T9" }, { id: "T10" }, { id: "T3" }])).toBe("T11");
  });
});
