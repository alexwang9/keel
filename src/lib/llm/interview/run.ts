import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_BETA, INTERVIEW_MAX_STEPS, LLM_TASKS } from "@/lib/llm/config";
import { codeForError, interviewError, requestIdOf } from "@/lib/llm/errors";
import type { InterviewEvent } from "@/lib/llm/interview/events";
import { handleToolCall, type ToolOutcome } from "@/lib/llm/interview/handlers";
import {
  toHistoryContent,
  type AssistantContent,
  type HistoryMessage,
} from "@/lib/llm/interview/history";
import { INTERVIEW_SYSTEM_PROMPT } from "@/lib/llm/interview/prompt";
import { FINISH_INTERVIEW, interviewTools } from "@/lib/llm/interview/tools";
import { logError, logWarn } from "@/lib/log";
import type { Spec, SpecDraft } from "@/lib/spec/schema";

export interface InterviewInput {
  history: HistoryMessage[];
  draft: SpecDraft;
}

const config = LLM_TASKS.interview;

function requestParams(history: HistoryMessage[]): Anthropic.Beta.MessageCreateParamsStreaming {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    // Two cache breakpoints: the fixed system prompt (shared by every conversation), and the
    // automatic one on the last block, which caches the conversation so far for the next turn.
    system: [{ type: "text", text: INTERVIEW_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    cache_control: { type: "ephemeral" },
    tools: interviewTools,
    // Forced tool choice is a 400 on this model; the prompt says when to call the tools.
    tool_choice: { type: "auto" },
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    messages: history,
    stream: true,
  };
}

type ToolUse = Extract<AssistantContent[number], { type: "tool_use" }>;

interface ToolRound {
  outcomes: ToolOutcome[];
  draft: SpecDraft;
  spec: Spec | undefined;
}

/**
 * Runs the round's tool calls. Spec updates run first and finish_interview last, so a finish is
 * judged against every update in the same response. Results keep the calls' original order.
 */
function runTools(calls: readonly ToolUse[], draft: SpecDraft): ToolRound {
  const order = [...calls.keys()].sort(
    (a, b) =>
      Number(calls[a]?.name === FINISH_INTERVIEW) - Number(calls[b]?.name === FINISH_INTERVIEW),
  );
  const outcomes = new Array<ToolOutcome>(calls.length);
  let current = draft;
  let spec: Spec | undefined;
  for (const index of order) {
    const call = calls[index];
    if (!call) continue;
    const outcome = handleToolCall(call, current);
    if (outcome.kind === "patched") current = outcome.draft;
    if (outcome.kind === "finished") spec = outcome.spec;
    outcomes[index] = outcome;
  }
  return { outcomes, draft: current, spec };
}

function* patchEvents(outcomes: readonly ToolOutcome[]): Generator<InterviewEvent> {
  for (const outcome of outcomes) {
    if (outcome.kind === "patched") {
      yield { type: "specPatch", ops: outcome.ops, draft: outcome.draft };
    }
  }
}

/** Streams one model call, yielding text deltas, and returns the final message. */
async function* streamStep(
  client: Anthropic,
  history: HistoryMessage[],
  signal: AbortSignal | undefined,
): AsyncGenerator<InterviewEvent, Anthropic.Beta.BetaMessage> {
  const stream = client.beta.messages.stream(requestParams(history), { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }
  return stream.finalMessage();
}

/** Why a finished step can't be used, if it can't. Checked before any tool in it runs. */
function stopProblem(message: Anthropic.Beta.BetaMessage): InterviewEvent | null {
  switch (message.stop_reason) {
    case "refusal":
      logWarn("interview.refusal", {
        model: message.model,
        category: message.stop_details?.category ?? "none",
      });
      return { type: "error", error: interviewError("refusal") };
    case "max_tokens":
    case "model_context_window_exceeded":
      logWarn("interview.truncated", { stopReason: message.stop_reason });
      return { type: "error", error: interviewError("max_tokens") };
    default:
      return null;
  }
}

async function* loop(
  client: Anthropic,
  input: InterviewInput,
  signal: AbortSignal | undefined,
): AsyncGenerator<InterviewEvent> {
  let history = input.history;
  let draft = input.draft;

  for (let step = 0; step < INTERVIEW_MAX_STEPS; step++) {
    const message = yield* streamStep(client, history, signal);
    const problem = stopProblem(message);
    if (problem) {
      yield problem;
      return;
    }

    const content = toHistoryContent(message.content);
    if (content.length === 0) {
      logWarn("interview.empty_reply", { stopReason: message.stop_reason ?? "none" });
      yield { type: "error", error: interviewError("unknown") };
      return;
    }
    const assistant: HistoryMessage = { role: "assistant", content };
    const calls = content.filter((block) => block.type === "tool_use");
    if (calls.length === 0) {
      yield { type: "turn", messages: [assistant] };
      return;
    }

    const round = runTools(calls, draft);
    const results: HistoryMessage = {
      role: "user",
      content: round.outcomes.map((outcome) => outcome.result),
    };
    yield* patchEvents(round.outcomes);
    yield { type: "turn", messages: [assistant, results] };
    if (round.spec) {
      yield { type: "complete", spec: round.spec };
      return;
    }
    history = [...history, assistant, results];
    draft = round.draft;
  }

  logWarn("interview.loop_limit", { steps: INTERVIEW_MAX_STEPS });
  yield { type: "error", error: interviewError("loop_limit") };
}

/**
 * One interview turn: calls the model, runs its tool calls against the draft and calls it again
 * until it replies without tools, finishes, or hits the step limit. Never throws: failures become
 * an `error` event, with details in the server log. Stops quietly if `signal` aborts.
 */
export async function* runInterview(
  client: Anthropic,
  input: InterviewInput,
  signal?: AbortSignal,
): AsyncGenerator<InterviewEvent> {
  try {
    yield* loop(client, input, signal);
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) return;
    const code = codeForError(error);
    const requestId = requestIdOf(error);
    logError("interview.failed", error, { code, ...(requestId ? { requestId } : {}) });
    yield { type: "error", error: interviewError(code) };
  }
}
