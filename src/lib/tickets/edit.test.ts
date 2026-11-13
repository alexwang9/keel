import { describe, expect, it } from "vitest";
import { validateDag, type DagError } from "@/lib/tickets/dag";
import {
  dagErrorsByTicket,
  deleteTicket,
  dependentsOf,
  newTicketId,
  saveTicket,
  uncheckedTicketIds,
} from "@/lib/tickets/edit";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const ids = (tickets: readonly { id: string }[]) => tickets.map((t) => t.id);

describe("saveTicket", () => {
  it("replaces a ticket in place", () => {
    const renamed = ticket("T2", ["T1"], { title: "Add books" });
    const result = saveTicket(shelfTickets, renamed);

    expect(result.ok && result.value[1]).toEqual(renamed);
    expect(result.ok && ids(result.value)).toEqual(["T1", "T2", "T3", "T4"]);
  });

  it("adds a new ticket at the end", () => {
    const result = saveTicket(shelfTickets, ticket("T5", ["T4"]));

    expect(result.ok && ids(result.value)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
  });

  it("re-sorts into topological order when the graph is valid", () => {
    const added = saveTicket(shelfTickets, ticket("T5"));
    if (!added.ok) throw new Error("expected ok");
    const t1 = shelfTickets[0] ?? ticket("T1");
    const result = saveTicket(added.value, { ...t1, dependsOn: ["T5"] });

    expect(result.ok && ids(result.value)).toEqual(["T5", "T1", "T2", "T3", "T4"]);
  });

  it("keeps the order when the edit leaves the graph invalid", () => {
    const t1 = shelfTickets[0] ?? ticket("T1");
    const result = saveTicket(shelfTickets, { ...t1, dependsOn: ["T4"] });

    expect(result.ok && ids(result.value)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(result.ok && validateDag(result.value).ok).toBe(false);
  });

  it("rejects an invalid ticket with readable errors", () => {
    const result = saveTicket(shelfTickets, ticket("T2", [], { title: " " }));

    expect(result).toEqual({ ok: false, error: ["tickets.1.title must not be empty"] });
  });

  it("trims text the way the schema does", () => {
    const result = saveTicket([], ticket("T1", [], { title: "  Padded  " }));

    expect(result.ok && result.value[0]?.title).toBe("Padded");
  });
});

describe("deleteTicket", () => {
  it("removes the ticket and leaves dependencies on it dangling", () => {
    const result = deleteTicket(shelfTickets, "T2");
    if (!result.ok) throw new Error("expected ok");

    expect(ids(result.value)).toEqual(["T1", "T3", "T4"]);
    expect(result.value[2]?.dependsOn).toEqual(["T2", "T3"]);
    expect(validateDag(result.value)).toEqual({
      ok: false,
      error: [{ kind: "unknownDependency", ticket: "T4", dependency: "T2" }],
    });
  });

  it("fails on an unknown id", () => {
    expect(deleteTicket(shelfTickets, "T9")).toEqual({
      ok: false,
      error: ["there is no ticket T9"],
    });
  });
});

describe("dependentsOf", () => {
  it("lists the tickets that depend on one, in order", () => {
    expect(ids(dependentsOf(shelfTickets, "T1"))).toEqual(["T2", "T3"]);
    expect(dependentsOf(shelfTickets, "T4")).toEqual([]);
  });
});

describe("newTicketId", () => {
  it("is one past the highest id", () => {
    expect(newTicketId(shelfTickets, shelfTickets)).toBe("T5");
    expect(newTicketId([], [])).toBe("T1");
  });

  it("skips an id a dangling dependency still points at", () => {
    const tickets = [ticket("T1"), ticket("T2", ["T7"])];
    expect(newTicketId(tickets, [])).toBe("T8");
  });

  it("skips ids from the checked list, so a deleted ticket's id isn't reused", () => {
    expect(newTicketId([ticket("T1")], [ticket("T1"), ticket("T2")])).toBe("T3");
  });
});

describe("dagErrorsByTicket", () => {
  it("files each error under every ticket it involves", () => {
    const unknown = { kind: "unknownDependency", ticket: "T4", dependency: "T9" } as const;
    const self = { kind: "selfDependency", ticket: "T2" } as const;
    const cycle: DagError = { kind: "cycle", path: ["T1", "T3", "T1"] };
    const byTicket = dagErrorsByTicket([unknown, self, cycle]);

    expect(Object.fromEntries(byTicket)).toEqual({
      T4: [unknown],
      T2: [self],
      T1: [cycle],
      T3: [cycle],
    });
  });
});

describe("uncheckedTicketIds", () => {
  it("is empty for the same tickets in any order", () => {
    expect(uncheckedTicketIds(shelfTickets, [...shelfTickets].reverse())).toEqual([]);
  });

  it("lists added, changed and deleted tickets, sorted", () => {
    const [t1, , t3, t4] = shelfTickets;
    if (!t1 || !t3 || !t4) throw new Error("fixture");
    const edited = [{ ...t1, size: "L" as const }, t3, t4, ticket("T10"), ticket("T5")];

    expect(uncheckedTicketIds(shelfTickets, edited)).toEqual(["T1", "T2", "T5", "T10"]);
  });

  it("ignores the order of dependencies", () => {
    const t4 = shelfTickets[3] ?? ticket("T4");
    const reordered = shelfTickets.with(3, { ...t4, dependsOn: ["T3", "T2"] });

    expect(uncheckedTicketIds(shelfTickets, reordered)).toEqual([]);
  });
});
