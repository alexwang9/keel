import { describe, expect, it } from "vitest";
import { parseIssueBody, renderIssueBody, type ParsedIssueBody } from "@/lib/tickets/issue-body";
import type { Ticket } from "@/lib/tickets/schema";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const issueNumbers = new Map([
  ["T1", 11],
  ["T2", 12],
  ["T3", 13],
  ["T4", 14],
]);

function rendered(entry: Ticket): string {
  const result = renderIssueBody(entry, issueNumbers);
  if (!result.ok) throw new Error(`expected the ticket to render: ${result.error}`);
  return result.value;
}

function parsed(body: string): ParsedIssueBody {
  const result = parseIssueBody(body);
  if (!result.ok) throw new Error(`expected the body to parse: ${result.error}`);
  return result.value;
}

/** What a round trip should give back for a ticket. */
const expectedFor = (entry: Ticket): ParsedIssueBody => ({
  ticketId: entry.id,
  description: entry.description,
  acceptanceChecks: entry.acceptanceChecks,
  dependsOn: entry.dependsOn.map((id) => issueNumbers.get(id) ?? 0),
});

describe("renderIssueBody", () => {
  it("renders the fixed format", () => {
    expect(rendered(shelfTickets[3] ?? ticket("T4"))).toBe(
      [
        "<!-- keel:ticket=T4 v1 -->",
        "",
        "Members vote on proposed books; the organiser closes the vote.",
        "",
        "## Acceptance checks",
        "",
        "- [ ] A member can vote once per round.",
        "- [ ] Closing the vote picks the winner.",
        "",
        "## Dependencies",
        "",
        "Depends on #12",
        "Depends on #13",
        "",
      ].join("\n"),
    );
  });

  it("says None. when there are no dependencies", () => {
    expect(rendered(ticket("T1"))).toContain("## Dependencies\n\nNone.\n");
  });

  it("keeps each acceptance check on one line", () => {
    expect(rendered(ticket("T1", [], { acceptanceChecks: ["Works\non two lines"] }))).toContain(
      "- [ ] Works on two lines\n",
    );
  });

  it("fails when a dependency has no issue number yet", () => {
    expect(renderIssueBody(ticket("T5", ["T1", "T9"]), issueNumbers)).toEqual({
      ok: false,
      error: "no issue number for T9, which T5 depends on",
    });
  });
});

describe("renderIssueBody → parseIssueBody round trip", () => {
  it.each(shelfTickets.map((entry) => [entry.id, entry] as const))(
    "round-trips %s",
    (_id, entry) => {
      expect(parsed(rendered(entry))).toEqual(expectedFor(entry));
    },
  );

  it("round-trips a description that looks like the format", () => {
    const tricky = ticket("T5", ["T2"], {
      description: [
        "Context first.",
        "## Acceptance checks",
        "- [ ] not a real check",
        "## Dependencies",
        "Depends on #4",
        "<!-- keel:ticket=T9 v1 -->",
      ].join("\n"),
    });

    expect(parsed(rendered(tricky))).toEqual(expectedFor(tricky));
  });
});

describe("parseIssueBody: edits made on GitHub", () => {
  const body = rendered(shelfTickets[3] ?? ticket("T4"));

  it("accepts ticked checks, CRLF and extra whitespace", () => {
    const edited = body.replace("- [ ] A member", "- [x] A member").replace(/\n/g, "  \r\n");

    expect(parsed(edited)).toEqual(expectedFor(shelfTickets[3] ?? ticket("T4")));
  });

  it("reads removed and added dependencies, ignoring repeats and other lines", () => {
    const edited = body.replace(
      "Depends on #12\nDepends on #13",
      "depends on #13\n- Depends on #99\nDepends on #13\nAlso see #5\nDepends on #0",
    );

    expect(parsed(edited).dependsOn).toEqual([13, 99]);
  });

  it("reads a missing section as empty", () => {
    const withoutDependencies = body.slice(0, body.indexOf("## Dependencies"));
    const withoutChecks = body.replace(/## Acceptance checks[\s\S]*?(?=## Dependencies)/, "");

    expect(parsed(withoutDependencies).dependsOn).toEqual([]);
    expect(parsed(withoutChecks)).toMatchObject({
      description: "Members vote on proposed books; the organiser closes the vote.",
      acceptanceChecks: [],
      dependsOn: [12, 13],
    });
  });

  it("keeps text added above the marker in the description", () => {
    expect(parsed(`Note from the owner.\n\n${body}`).description).toBe(
      "Note from the owner.\n\nMembers vote on proposed books; the organiser closes the vote.",
    );
  });

  it("accepts a marker without a version", () => {
    expect(parsed(body.replace(" v1 -->", " -->")).ticketId).toBe("T4");
  });
});

describe("parseIssueBody: not a Keel issue", () => {
  it.each([
    ["no marker", "Just an issue.", "not a Keel issue: no keel:ticket marker"],
    ["a malformed id", "<!-- keel:ticket=T0 -->", "not a Keel issue: no keel:ticket marker"],
    ["a newer format", "<!-- keel:ticket=T1 v2 -->", "unsupported Keel issue format v2"],
  ])("rejects %s", (_label, body, message) => {
    expect(parseIssueBody(body)).toEqual({ ok: false, error: message });
  });
});
