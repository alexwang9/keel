import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_BETA, LLM_TASKS, TICKET_IMPACT_DEADLINE_MS } from "@/lib/llm/config";
import { impactError } from "@/lib/llm/errors";
import type { ImpactEvent } from "@/lib/llm/impact/events";
import { impactOutputFormat, parseImpactOutput } from "@/lib/llm/impact/output";
import { IMPACT_SYSTEM_PROMPT, impactMessages, impactUserMessage } from "@/lib/llm/impact/prompt";
import type { ImpactRequest } from "@/lib/llm/impact/request";
import { repairable } from "@/lib/llm/repair";
import { outputText, stopProblem, streamStructured, withDeadline } from "@/lib/llm/structured";
import { logWarn } from "@/lib/log";
import { renderSpecMarkdown } from "@/lib/spec/render";

const config = LLM_TASKS.ticketRevision;

function requestParams(input: ImpactRequest): Anthropic.Beta.MessageCreateParamsStreaming {
  const user = impactUserMessage(renderSpecMarkdown(input.spec), input.checked, input.tickets);
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: IMPACT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort, format: impactOutputFormat },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    messages: impactMessages(user, input.repair),
    stream: true,
  };
}

async function* check(
  client: Anthropic,
  input: ImpactRequest,
  signal: AbortSignal,
): AsyncGenerator<ImpactEvent> {
  yield { type: "started" };
  const stream = streamStructured(client, requestParams(input), signal);
  let next = await stream.next();
  while (!next.done) {
    // Proposals are short: only the thinking phase is worth reporting.
    if (next.value.type === "thinking") yield { type: "thinking" };
    next = await stream.next();
  }
  const message = next.value;
  const problem = stopProblem(message, "impact");
  if (problem) {
    yield { type: "error", error: impactError(problem) };
    return;
  }

  yield { type: "validating" };
  const output = outputText(message);
  const parsed = parseImpactOutput(output, input.tickets, input.checked);
  if (parsed.ok) {
    yield { type: "complete", ops: parsed.value };
    return;
  }

  logWarn("impact.invalid_output", {
    attempt: input.repair ? "repair" : "first",
    errors: parsed.error.length,
  });
  if (input.repair || !repairable(output)) {
    yield { type: "error", error: impactError("invalid_output") };
    return;
  }
  yield { type: "invalid", output, errors: parsed.error };
}

export interface ImpactOptions {
  // Overrides `TICKET_IMPACT_DEADLINE_MS`, for tests.
  deadlineMs?: number;
}

/**
 * One impact check call (a first attempt, or the repair of a failed one). Never throws:
 * failures become an `error` event, with details in the server log. Stops quietly if `signal`
 * aborts, and reports `timeout` if the deadline passes first.
 */
export function runImpactCheck(
  client: Anthropic,
  input: ImpactRequest,
  signal?: AbortSignal,
  options: ImpactOptions = {},
): AsyncGenerator<ImpactEvent> {
  return withDeadline((combined) => check(client, input, combined), {
    task: "impact",
    attempt: input.repair ? "repair" : "first",
    deadlineMs: options.deadlineMs ?? TICKET_IMPACT_DEADLINE_MS,
    signal,
    toError: (code) => ({ type: "error", error: impactError(code) }),
  });
}
