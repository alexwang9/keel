import { describe, expect, it } from "vitest";
import { repairMessage, ticketMessages } from "@/lib/llm/tickets/prompt";

describe("ticketMessages", () => {
  it("sends only the spec on a first attempt", () => {
    expect(ticketMessages("# Shelf", undefined)).toEqual([{ role: "user", content: "# Shelf" }]);
  });

  it("replays the failed output as the assistant turn, then asks for a fix", () => {
    const repair = { output: '{"tickets":[]}', errors: ["a", "b"] };
    expect(ticketMessages("# Shelf", repair)).toEqual([
      { role: "user", content: "# Shelf" },
      { role: "assistant", content: '{"tickets":[]}' },
      { role: "user", content: repairMessage(["a", "b"]) },
    ]);
  });
});

describe("repairMessage", () => {
  it("lists every error and asks for the full corrected list", () => {
    const message = repairMessage(["T1 depends on itself", "T9 is unknown"]);
    expect(message).toContain("- T1 depends on itself\n- T9 is unknown");
    expect(message).toMatch(/full corrected ticket list/);
  });
});
