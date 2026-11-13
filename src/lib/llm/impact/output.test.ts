import { describe, expect, it } from "vitest";
import { impactOutputFormat, parseImpactOutput } from "@/lib/llm/impact/output";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";
import { ticket } from "@/test/fixtures/tickets";
import { objectsIn, UNSUPPORTED_KEYWORDS } from "@/test/json-schema";

const output = (ops: unknown): string => JSON.stringify({ ops });
const parse = (text: string) => parseImpactOutput(text, editedTickets, checkedTickets);
const reason = "because";

describe("impactOutputFormat", () => {
  const nodes = [...objectsIn(impactOutputFormat.schema)];

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
    expect(JSON.stringify(impactOutputFormat)).toMatchSnapshot();
  });
});

describe("parseImpactOutput", () => {
  it("accepts a proposal that fixes the graph", () => {
    expect(parse(output(fixOps))).toEqual({ ok: true, value: fixOps });
  });

  it("accepts an empty proposal when the tickets are already valid", () => {
    const tickets = [...checkedTickets, ticket("T5", ["T1"])];
    expect(parseImpactOutput(output([]), tickets, checkedTickets)).toEqual({ ok: true, value: [] });
  });

  it("rejects an empty proposal that leaves a dependency problem", () => {
    const result = parse(output([]));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.join("\n")).toMatch(/T4.*T3/);
  });

  it("reports output that isn't JSON", () => {
    const result = parse('{"ops": [');
    expect(!result.ok && result.error[0]).toMatch(/^output is not valid JSON/);
  });

  it("reports schema problems with their paths", () => {
    const result = parse(output([{ op: "updateTicket", id: "T4", changes: {}, reason }]));
    expect(!result.ok && result.error).toEqual(["ops.0.changes must change at least one field"]);
  });

  it("rejects ops on unknown tickets", () => {
    const result = parse(output([{ op: "deleteTicket", id: "T9", reason }]));
    expect(!result.ok && result.error).toEqual(["ops.0 no ticket with id T9"]);
  });

  it("rejects a new ticket that reuses a deleted ticket's id", () => {
    const ops = [{ op: "addTicket", ticket: ticket("T3", ["T1"]), reason }];
    expect(parse(output(ops))).toEqual({
      ok: false,
      error: ["ops.0 new ticket T3 reuses an id already in use"],
    });
  });

  it("rejects a proposal that adds a cycle", () => {
    const ops = [...fixOps, { op: "addDependency", ticket: "T1", dependsOn: "T4", reason }];
    const result = parse(output(ops));
    expect(!result.ok && result.error.join("\n")).toMatch(/cycle/i);
  });
});
