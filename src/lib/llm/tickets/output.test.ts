import { describe, expect, it } from "vitest";
import { MAX_REPAIR_ERRORS } from "@/lib/llm/repair";
import { parseTicketOutput, ticketCounter, ticketOutputFormat } from "@/lib/llm/tickets/output";
import { objectsIn, UNSUPPORTED_KEYWORDS } from "@/test/json-schema";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const output = (tickets: unknown): string => JSON.stringify({ tickets });

describe("ticketOutputFormat", () => {
  const nodes = [...objectsIn(ticketOutputFormat.schema)];

  it("uses only keywords structured outputs support", () => {
    const keys = nodes.flatMap((node) => Object.keys(node));
    expect(keys.filter((key) => UNSUPPORTED_KEYWORDS.has(key))).toEqual([]);
  });

  it("closes every object schema", () => {
    const objects = nodes.filter((node) => node.type === "object");
    expect(objects.length).toBeGreaterThan(1);
    for (const node of objects) expect(node.additionalProperties).toBe(false);
  });

  it("is byte-stable, since it is part of every request", () => {
    expect(JSON.stringify(ticketOutputFormat)).toMatchSnapshot();
  });
});

describe("parseTicketOutput", () => {
  it("returns valid tickets unchanged when already in order", () => {
    expect(parseTicketOutput(output(shelfTickets))).toEqual({ ok: true, value: shelfTickets });
  });

  it("puts tickets in topological order", () => {
    const result = parseTicketOutput(output([ticket("T2", ["T1"]), ticket("T1")]));
    expect(result.ok && result.value.map((t) => t.id)).toEqual(["T1", "T2"]);
  });

  it("reports output that isn't JSON", () => {
    const result = parseTicketOutput('{"tickets": [');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error[0]).toMatch(/^output is not valid JSON/);
  });

  it("reports schema problems with their paths", () => {
    const result = parseTicketOutput(output([ticket("T1", [], { acceptanceChecks: [] })]));
    expect(result).toEqual({
      ok: false,
      error: ["tickets.0.acceptanceChecks must have at least one acceptance check"],
    });
  });

  it("reports duplicate ids", () => {
    const result = parseTicketOutput(output([ticket("T1"), ticket("T1")]));
    expect(!result.ok && result.error).toEqual(["tickets.1.id duplicates id T1"]);
  });

  it("reports dependency graph errors, cycle path included", () => {
    const result = parseTicketOutput(output([ticket("T1", ["T2"]), ticket("T2", ["T1"])]));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.join("\n")).toMatch(/T1.*T2.*T1/);
  });

  it("caps the errors to what a repair request accepts and says how many were left out", () => {
    const tickets = Array.from({ length: 40 }, (_, i) => ticket(`T${String(i + 1)}`, ["T99"]));
    const result = parseTicketOutput(output(tickets));
    expect(!result.ok && result.error).toHaveLength(MAX_REPAIR_ERRORS);
    expect(!result.ok && result.error.at(-1)).toBe("…and 11 more problems");
  });
});

describe("ticketCounter", () => {
  it("counts ticket ids as the text grows, including ids split across deltas", () => {
    const count = ticketCounter();
    expect(count('{"tickets":[{"id":"T')).toBe(0);
    expect(count('{"tickets":[{"id":"T1","dependsOn":["T2"]')).toBe(1);
    expect(count('{"tickets":[{"id":"T1","dependsOn":["T2"]},{ "id" : "T2"')).toBe(2);
  });
});
