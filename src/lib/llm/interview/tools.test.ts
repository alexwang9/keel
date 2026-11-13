import { describe, expect, it } from "vitest";
import { FINISH_INTERVIEW, interviewTools, UPDATE_SPEC } from "@/lib/llm/interview/tools";
import { objectsIn, UNSUPPORTED_KEYWORDS } from "@/test/json-schema";

const strictTools = interviewTools.filter((tool) => tool.strict === true);

describe("interviewTools", () => {
  it("makes finish_interview strict and update_spec not, since its grammar is too large", () => {
    expect(interviewTools.map((tool) => [tool.name, tool.strict ?? false])).toEqual([
      [UPDATE_SPEC, false],
      [FINISH_INTERVIEW, true],
    ]);
  });

  it.each(strictTools)("$name uses only keywords strict mode supports", (tool) => {
    // Also collects field names under `properties`; none of ours clash with a keyword.
    const keys = [...objectsIn(tool.input_schema)].flatMap((node) => Object.keys(node));
    expect(keys.filter((key) => UNSUPPORTED_KEYWORDS.has(key))).toEqual([]);
  });

  it.each(strictTools)("$name closes every object schema", (tool) => {
    const objects = [...objectsIn(tool.input_schema)].filter((node) => node.type === "object");
    expect(objects.length).toBeGreaterThan(0);
    for (const node of objects) expect(node.additionalProperties).toBe(false);
  });

  it("gives update_spec the real limits, so the model sees them", () => {
    const keys = new Set([...objectsIn(interviewTools[0]?.input_schema)].flatMap(Object.keys));
    for (const keyword of ["oneOf", "maxLength", "pattern", "maxItems"]) {
      expect(keys).toContain(keyword);
    }
    expect(keys).not.toContain("$schema");
  });

  it("requires ops on update_spec and no input on finish_interview", () => {
    const [update, finish] = interviewTools;
    expect(update?.input_schema.required).toEqual(["ops"]);
    expect(finish?.input_schema.properties).toEqual({});
  });

  it("is byte-stable, since the tools head the cached prompt prefix", () => {
    expect(JSON.stringify(interviewTools)).toMatchSnapshot();
  });
});
