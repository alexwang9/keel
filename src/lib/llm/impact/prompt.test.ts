import { describe, expect, it } from "vitest";
import {
  IMPACT_SYSTEM_PROMPT,
  impactMessages,
  impactRepairMessage,
  impactUserMessage,
} from "@/lib/llm/impact/prompt";
import { TICKET_RULES, TICKET_SYSTEM_PROMPT } from "@/lib/llm/tickets/prompt";
import { checkedTickets, editedTickets } from "@/test/fixtures/impact";

describe("IMPACT_SYSTEM_PROMPT", () => {
  it("shares the ticket rules with generation", () => {
    expect(IMPACT_SYSTEM_PROMPT).toContain(TICKET_RULES);
    expect(TICKET_SYSTEM_PROMPT).toContain(TICKET_RULES);
  });
});

describe("impactUserMessage", () => {
  const message = impactUserMessage("# Shelf\n", checkedTickets, editedTickets);

  it("includes the spec, the current tickets and the edits", () => {
    expect(message).toMatch(/^# Spec\n\n# Shelf\n\n# Current tickets/);
    expect(message).toContain(JSON.stringify({ tickets: editedTickets }, null, 2));
    expect(message).toContain('Deleted T3 "Book status".');
  });

  it("lists current dependency problems", () => {
    expect(message).toMatch(/# Dependency problems in the current tickets\n\n- .*T4.*T3/);
  });

  it("says None when there are no problems", () => {
    const valid = impactUserMessage("# Shelf", checkedTickets, checkedTickets.slice(0, 3));
    expect(valid).toContain("# Dependency problems in the current tickets\n\nNone.");
  });

  it("gives new tickets ids past every id still referenced", () => {
    expect(message).toMatch(/New tickets use ids from T5 upward/);
  });
});

describe("impactMessages", () => {
  it("sends only the user message on a first attempt", () => {
    expect(impactMessages("hi", undefined)).toEqual([{ role: "user", content: "hi" }]);
  });

  it("replays the failed output, then asks for a fix", () => {
    const repair = { output: '{"ops":[]}', errors: ["ops.0 no ticket with id T9"] };
    expect(impactMessages("hi", repair)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: '{"ops":[]}' },
      { role: "user", content: impactRepairMessage(repair.errors) },
    ]);
    expect(impactRepairMessage(repair.errors)).toContain("- ops.0 no ticket with id T9");
  });
});
