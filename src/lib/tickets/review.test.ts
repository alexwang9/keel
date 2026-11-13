import { describe, expect, it } from "vitest";
import {
  acceptedOps,
  allDecided,
  describeOp,
  previewChanges,
  previewProposal,
  type Decisions,
} from "@/lib/tickets/review";
import type { ProposalOp } from "@/lib/tickets/schema";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";

const all = (decision: "accept" | "reject"): Decisions => fixOps.map(() => decision);

describe("describeOp", () => {
  it.each([
    [0, "Stop T4 depending on T3"],
    [1, 'Add T5 "Track reading status"'],
    [2, "Make T4 depend on T5"],
    [3, 'Change the size of T4 "Vote on the next book"'],
  ])("describes op %i", (index, text) => {
    const op = fixOps[index];
    expect(op && describeOp(op, editedTickets)).toBe(text);
  });

  it("names a deleted ticket and every changed field", () => {
    expect(describeOp({ op: "deleteTicket", id: "T2", reason: "r" }, editedTickets)).toBe(
      'Delete T2 "Add a book"',
    );
    const update: ProposalOp = {
      op: "updateTicket",
      id: "T9",
      changes: { title: "x", acceptanceChecks: ["y"] },
      reason: "r",
    };
    expect(describeOp(update, editedTickets)).toBe("Change the title, acceptance checks of T9");
  });
});

describe("previewProposal", () => {
  it("applies every accepted op", () => {
    const result = previewProposal(editedTickets, fixOps, all("accept"));
    expect(result.ok && result.value.map((t) => t.id)).toEqual(["T1", "T2", "T4", "T5"]);
  });

  it("rejecting everything keeps the tickets, and reports their problems", () => {
    const result = previewProposal(editedTickets, fixOps, all("reject"));
    expect(result).toEqual({ ok: false, error: ["T4 depends on unknown ticket T3"] });
  });

  it("blocks a combination that leaves a dependency on a rejected new ticket", () => {
    // Accept the new dependency on T5 without the op that adds T5.
    const decisions: Decisions = ["accept", "reject", "accept", "accept"];
    expect(previewProposal(editedTickets, fixOps, decisions)).toEqual({
      ok: false,
      error: ["T4 depends on unknown ticket T5"],
    });
  });

  it("names an op that can't apply by its number in the proposal", () => {
    const [remove, , , update] = fixOps;
    const ops = [update, remove, remove].filter((op) => op !== undefined);
    expect(previewProposal(editedTickets, ops, ["reject", "accept", "accept"])).toEqual({
      ok: false,
      error: ["Change 3 can't be applied: T4 does not depend on T3."],
    });
  });
});

describe("previewChanges", () => {
  it("sorts ids into added, changed and deleted", () => {
    const result = previewProposal(editedTickets, fixOps, all("accept"));
    const after = result.ok ? result.value : [];
    expect(previewChanges(editedTickets, after)).toEqual({
      added: ["T5"],
      changed: ["T4"],
      deleted: [],
    });
    expect(previewChanges(checkedTickets, editedTickets)).toEqual({
      added: [],
      changed: [],
      deleted: ["T3"],
    });
  });
});

describe("decisions", () => {
  it("knows when every op is decided, and which are accepted", () => {
    expect(allDecided(fixOps, ["accept", "reject", "accept"])).toBe(false);
    expect(allDecided(fixOps, ["accept", "reject", "accept", "reject"])).toBe(true);
    expect(allDecided([], [])).toBe(true);
    expect(acceptedOps(fixOps, ["accept", "reject", "accept", "reject"])).toEqual([
      fixOps[0],
      fixOps[2],
    ]);
  });
});
