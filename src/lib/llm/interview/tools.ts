import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import { FINISH_INTERVIEW, UPDATE_SPEC } from "@/lib/llm/interview/tool-names";
import { SpecPatchSchema } from "@/lib/spec/schema";

export {
  FINISH_INTERVIEW,
  INTERVIEW_TOOL_NAMES,
  UPDATE_SPEC,
} from "@/lib/llm/interview/tool-names";

export const UpdateSpecInputSchema = z.object({ ops: SpecPatchSchema });
export const FinishInterviewInputSchema = z.object({});

type InputSchema = Anthropic.Beta.BetaTool["input_schema"];

/** The plain JSON Schema, with its length, pattern and size limits, for a non-strict tool. */
function looseSchemaFrom(schema: z.ZodType): InputSchema {
  const json = z.toJSONSchema(schema, { io: "input", reused: "ref" });
  delete json.$schema;
  return { ...json, type: "object" };
}

/**
 * A schema strict mode can compile. The SDK's transform turns `oneOf` into `anyOf`, moves length
 * and pattern limits into descriptions and closes every object.
 */
function strictSchemaFrom(schema: z.ZodType): InputSchema {
  const json = transformJSONSchema(z.toJSONSchema(schema, { io: "input", reused: "ref" }));
  return { ...json, type: "object" };
}

export const interviewTools: Anthropic.Beta.BetaTool[] = [
  {
    // Not strict: the API rejects the compiled grammar for the full patch union as too large.
    // `applySpecPatch` validates every input, and invalid ones come back as an error result.
    name: UPDATE_SPEC,
    description:
      "Record what the user has told you in the spec draft. Send an ordered list of ops: `set` " +
      "replaces a whole field, `upsert` adds or replaces a list item by id, `remove` deletes one. " +
      "Ops apply all-or-nothing; if any op is invalid, nothing changes and the errors come back.",
    input_schema: looseSchemaFrom(UpdateSpecInputSchema),
  },
  {
    name: FINISH_INTERVIEW,
    description:
      "Call when every spec field is answered, every feature has at least one acceptance check " +
      "and no open questions remain. Rejected with the remaining gaps if the spec is incomplete.",
    input_schema: strictSchemaFrom(FinishInterviewInputSchema),
    strict: true,
  },
];
