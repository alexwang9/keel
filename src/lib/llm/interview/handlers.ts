import type Anthropic from "@anthropic-ai/sdk";
import { isSpecComplete } from "@/lib/spec/complete";
import { findMissing } from "@/lib/spec/missing";
import { applySpecPatch } from "@/lib/spec/patch";
import type { Spec, SpecDraft, SpecOp } from "@/lib/spec/schema";
import { FINISH_INTERVIEW, UPDATE_SPEC, UpdateSpecInputSchema } from "@/lib/llm/interview/tools";
import { formatIssues } from "@/lib/validation";

type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** What running one tool call did: the reply to the model, and any change the client must see. */
export type ToolOutcome =
  | { kind: "rejected"; result: ToolResult }
  | { kind: "patched"; result: ToolResult; ops: SpecOp[]; draft: SpecDraft }
  | { kind: "finished"; result: ToolResult; spec: Spec };

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

const reply = (call: ToolCall, content: string, isError = false): ToolResult => ({
  type: "tool_result",
  tool_use_id: call.id,
  content,
  ...(isError ? { is_error: true } : {}),
});

const bulletList = (lines: readonly string[]): string =>
  lines.map((line) => `- ${line}`).join("\n");

function remaining(draft: SpecDraft): string {
  const missing = findMissing(draft);
  if (missing.length === 0) {
    return "Nothing is missing. Confirm the spec with the user, then call finish_interview.";
  }
  return `Still missing:\n${bulletList(missing)}`;
}

function updateSpec(call: ToolCall, draft: SpecDraft): ToolOutcome {
  const input = UpdateSpecInputSchema.safeParse(call.input);
  if (!input.success) {
    const errors = formatIssues(input.error.issues);
    return { kind: "rejected", result: reply(call, rejection(errors), true) };
  }
  const patched = applySpecPatch(draft, input.data.ops);
  if (!patched.ok) {
    return { kind: "rejected", result: reply(call, rejection(patched.error), true) };
  }
  return {
    kind: "patched",
    result: reply(
      call,
      `Applied ${String(input.data.ops.length)} op(s). ${remaining(patched.value)}`,
    ),
    ops: input.data.ops,
    draft: patched.value,
  };
}

const rejection = (errors: readonly string[]): string =>
  `Nothing was changed. Fix these errors and call update_spec again:\n${bulletList(errors)}`;

function finishInterview(call: ToolCall, draft: SpecDraft): ToolOutcome {
  const completeness = isSpecComplete(draft);
  if (!completeness.complete) {
    const content = `The spec is not complete yet. Continue the interview on these gaps:\n${bulletList(completeness.missing)}`;
    return { kind: "rejected", result: reply(call, content, true) };
  }
  return {
    kind: "finished",
    result: reply(call, "Interview finished. The user will now review the spec."),
    spec: completeness.spec,
  };
}

/** Runs one tool call from the model against the current draft. Never throws. */
export function handleToolCall(call: ToolCall, draft: SpecDraft): ToolOutcome {
  switch (call.name) {
    case UPDATE_SPEC:
      return updateSpec(call, draft);
    case FINISH_INTERVIEW:
      return finishInterview(call, draft);
    default:
      return { kind: "rejected", result: reply(call, `Unknown tool ${call.name}.`, true) };
  }
}
