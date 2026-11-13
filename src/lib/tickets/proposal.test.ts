import { describe, expect, it } from "vitest";
import { applyProposalOps } from "@/lib/tickets/proposal";
import type { Ticket } from "@/lib/tickets/schema";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const reason = "Keeps the plan consistent.";

function applied(tickets: readonly Ticket[], ops: unknown): Ticket[] {
  const result = applyProposalOps(tickets, ops);
  if (!result.ok) throw new Error(`expected the ops to apply: ${result.error.join("; ")}`);
  return result.value;
}

function errorsFor(tickets: readonly Ticket[], ops: unknown): string[] {
  const result = applyProposalOps(tickets, ops);
  if (result.ok) throw new Error("expected the ops to be rejected");
  return result.error;
}

const dependenciesOf = (tickets: readonly Ticket[], id: string) =>
  tickets.find((entry) => entry.id === id)?.dependsOn;

describe("applyProposalOps: each op", () => {
  it("accepts an empty proposal, leaving the tickets as they were", () => {
    expect(applied(shelfTickets, [])).toEqual(shelfTickets);
  });

  it("updates only the given fields of a ticket", () => {
    const tickets = applied(shelfTickets, [
      {
        op: "updateTicket",
        id: "T2",
        changes: { size: "M", title: "  Add or edit a book " },
        reason,
      },
    ]);

    expect(tickets[1]).toEqual({ ...shelfTickets[1], size: "M", title: "Add or edit a book" });
  });

  it("adds and removes dependencies", () => {
    const tickets = applied(shelfTickets, [
      { op: "addDependency", ticket: "T3", dependsOn: "T2", reason },
      { op: "removeDependency", ticket: "T4", dependsOn: "T2", reason },
    ]);

    expect(dependenciesOf(tickets, "T3")).toEqual(["T1", "T2"]);
    expect(dependenciesOf(tickets, "T4")).toEqual(["T3"]);
  });

  it("adds a ticket at the end, and lets later ops depend on it", () => {
    const tickets = applied(shelfTickets, [
      { op: "addTicket", ticket: ticket("T5", ["T1"]), reason },
      { op: "addDependency", ticket: "T4", dependsOn: "T5", reason },
    ]);

    expect(tickets.map((entry) => entry.id)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(dependenciesOf(tickets, "T4")).toEqual(["T2", "T3", "T5"]);
  });

  it("deletes a ticket once nothing depends on it", () => {
    const tickets = applied(shelfTickets, [
      { op: "removeDependency", ticket: "T4", dependsOn: "T3", reason },
      { op: "deleteTicket", id: "T3", reason },
    ]);

    expect(tickets.map((entry) => entry.id)).toEqual(["T1", "T2", "T4"]);
  });
});

describe("applyProposalOps: blocked combinations", () => {
  it("blocks deleting a ticket others still depend on", () => {
    expect(errorsFor(shelfTickets, [{ op: "deleteTicket", id: "T1", reason }])).toEqual([
      "T2 depends on unknown ticket T1",
      "T3 depends on unknown ticket T1",
    ]);
  });

  it("blocks a dependency that closes a cycle", () => {
    expect(
      errorsFor(shelfTickets, [{ op: "addDependency", ticket: "T1", dependsOn: "T4", reason }]),
    ).toEqual(["dependency cycle: T1 → T4 → T2 → T1"]);
  });

  it("blocks a dependency on a ticket that doesn't exist, or on itself", () => {
    expect(
      errorsFor(shelfTickets, [
        { op: "addDependency", ticket: "T2", dependsOn: "T9", reason },
        { op: "addDependency", ticket: "T3", dependsOn: "T3", reason },
      ]),
    ).toEqual(["T2 depends on unknown ticket T9", "T3 depends on itself"]);
  });

  it("blocks going past the dependency limit", () => {
    const many = Array.from({ length: 21 }, (_, index) => ticket(`T${String(index + 2)}`));
    const ops = many.map((entry) => ({
      op: "addDependency",
      ticket: "T1",
      dependsOn: entry.id,
      reason,
    }));

    expect(errorsFor([ticket("T1"), ...many], ops)).toEqual([
      "tickets.0.dependsOn must have at most 20 items",
    ]);
  });
});

describe("applyProposalOps: invalid ops", () => {
  it.each([
    [
      "an unknown ticket",
      { op: "updateTicket", id: "T9", changes: { size: "S" }, reason },
      "ops.0 no ticket with id T9",
    ],
    [
      "deleting an unknown ticket",
      { op: "deleteTicket", id: "T9", reason },
      "ops.0 no ticket with id T9",
    ],
    [
      "a duplicate new ticket",
      { op: "addTicket", ticket: ticket("T2"), reason },
      "ops.0 ticket T2 already exists",
    ],
    [
      "an existing dependency",
      { op: "addDependency", ticket: "T2", dependsOn: "T1", reason },
      "ops.0 T2 already depends on T1",
    ],
    [
      "a missing dependency",
      { op: "removeDependency", ticket: "T2", dependsOn: "T3", reason },
      "ops.0 T2 does not depend on T3",
    ],
  ])("rejects %s", (_label, op, message) => {
    expect(errorsFor(shelfTickets, [op])).toEqual([message]);
  });

  it.each([
    ["not an array", { op: "deleteTicket" }, /^ops Invalid input: expected array/],
    ["an unknown op", [{ op: "renameTicket", id: "T1", reason }], /^ops\.0\.op Invalid/],
    ["a missing reason", [{ op: "deleteTicket", id: "T1" }], /^ops\.0\.reason /],
    [
      "an invalid new ticket",
      [{ op: "addTicket", ticket: ticket("T5", [], { acceptanceChecks: [] }), reason }],
      /^ops\.0\.ticket\.acceptanceChecks /,
    ],
  ])("rejects %s before applying anything", (_label, ops, message) => {
    const errors = errorsFor(shelfTickets, ops);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
  });

  it("applies nothing when any op fails, and never mutates the tickets", () => {
    const tickets = structuredClone(shelfTickets);
    const result = applyProposalOps(tickets, [
      { op: "updateTicket", id: "T1", changes: { title: "Renamed" }, reason },
      { op: "deleteTicket", id: "T9", reason },
    ]);

    expect(result.ok).toBe(false);
    expect(tickets).toEqual(shelfTickets);

    applied(tickets, [{ op: "addDependency", ticket: "T3", dependsOn: "T2", reason }]);
    expect(tickets).toEqual(shelfTickets);
  });
});
