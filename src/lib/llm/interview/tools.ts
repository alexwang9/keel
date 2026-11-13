import type Anthropic from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";
import { SpecPatchSchema } from "@/lib/spec/schema";

export const UPDATE_SPEC = "update_spec";
export const FINISH_INTERVIEW = "finish_interview";
export const INTERVIEW_TOOL_NAMES = [UPDATE_SPEC, FINISH_INTERVIEW] as const;

export const UpdateSpecInputSchema = z.object({ ops: SpecPatchSchema });
export const FinishInterviewInputSchema = z.object({});

type InputSchema = Anthropic.Beta.BetaTool["input_schema"];

/**
 * Strict tool schemas from the Zod schemas. The SDK's transform rewrites what strict mode can't
 * compile (`oneOf` → `anyOf`, length and pattern limits moved into descriptions) and closes every
 * object. Those limits and the cross-item rules are still enforced by `applySpecPatch`.
 */
function inputSchemaFrom(schema: z.ZodType): InputSchema {
  const json = transformJSONSchema(z.toJSONSchema(schema, { io: "input", reused: "ref" }));
  return { ...json, type: "object" };
}

export const interviewTools: Anthropic.Beta.BetaTool[] = [
  {
    name: UPDATE_SPEC,
    description:
      "Record what the user has told you in the spec draft. Send an ordered list of ops: `set` " +
      "replaces a whole field, `upsert` adds or replaces a list item by id, `remove` deletes one. " +
      "Ops apply all-or-nothing; if any op is invalid, nothing changes and the errors come back.",
    input_schema: inputSchemaFrom(UpdateSpecInputSchema),
    strict: true,
  },
  {
    name: FINISH_INTERVIEW,
    description:
      "Call when every spec field is answered, every feature has at least one acceptance check " +
      "and no open questions remain. Rejected with the remaining gaps if the spec is incomplete.",
    input_schema: inputSchemaFrom(FinishInterviewInputSchema),
    strict: true,
  },
];
