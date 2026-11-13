import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_BETA, LLM_TASKS, TICKET_GENERATION_DEADLINE_MS } from "@/lib/llm/config";
import { ticketError } from "@/lib/llm/errors";
import { repairable } from "@/lib/llm/repair";
import { outputText, stopProblem, streamStructured, withDeadline } from "@/lib/llm/structured";
import type { TicketEvent } from "@/lib/llm/tickets/events";
import { parseTicketOutput, ticketCounter, ticketOutputFormat } from "@/lib/llm/tickets/output";
import { TICKET_SYSTEM_PROMPT, ticketMessages } from "@/lib/llm/tickets/prompt";
import type { TicketRequest } from "@/lib/llm/tickets/request";
import { logWarn } from "@/lib/log";
import { renderSpecMarkdown } from "@/lib/spec/render";

const config = LLM_TASKS.ticketGeneration;

function requestParams(input: TicketRequest): Anthropic.Beta.MessageCreateParamsStreaming {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: "text", text: TICKET_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: config.effort, format: ticketOutputFormat },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    messages: ticketMessages(renderSpecMarkdown(input.spec), input.repair),
    stream: true,
  };
}

/** Streams one model call as progress events and returns the final message. */
async function* streamCall(
  client: Anthropic,
  input: TicketRequest,
  signal: AbortSignal,
): AsyncGenerator<TicketEvent, Anthropic.Beta.BetaMessage> {
  const stream = streamStructured(client, requestParams(input), signal);
  let count = ticketCounter();
  let drafted = 0;
  for (;;) {
    const next = await stream.next();
    if (next.done) return next.value;
    const progress = next.value;
    if (progress.type === "thinking") yield { type: "thinking" };
    // A refusal fallback restarts the answer on another model: count from scratch.
    if (progress.type === "restart") count = ticketCounter();
    if (progress.type !== "text") continue;
    const seen = count(progress.text);
    if (seen !== drafted) {
      drafted = seen;
      yield { type: "drafting", count: seen };
    }
  }
}

async function* generate(
  client: Anthropic,
  input: TicketRequest,
  signal: AbortSignal,
): AsyncGenerator<TicketEvent> {
  yield { type: "started" };
  const message = yield* streamCall(client, input, signal);
  const problem = stopProblem(message, "tickets");
  if (problem) {
    yield { type: "error", error: ticketError(problem) };
    return;
  }

  yield { type: "validating" };
  const output = outputText(message);
  const parsed = parseTicketOutput(output);
  if (parsed.ok) {
    yield { type: "complete", tickets: parsed.value };
    return;
  }

  const attempt = input.repair ? "repair" : "first";
  logWarn("tickets.invalid_output", { attempt, errors: parsed.error.length });
  // One repair only, and only for an output the repair request can carry back.
  if (input.repair || !repairable(output)) {
    yield { type: "error", error: ticketError("invalid_output") };
    return;
  }
  yield { type: "invalid", output, errors: parsed.error };
}

export interface GenerationOptions {
  // Overrides `TICKET_GENERATION_DEADLINE_MS`, for tests.
  deadlineMs?: number;
}

/**
 * One ticket generation call (a first attempt, or the repair of a failed one). Never throws:
 * failures become an `error` event, with details in the server log. Stops quietly if `signal`
 * aborts, and reports `timeout` if the deadline passes first.
 */
export function runTicketGeneration(
  client: Anthropic,
  input: TicketRequest,
  signal?: AbortSignal,
  options: GenerationOptions = {},
): AsyncGenerator<TicketEvent> {
  return withDeadline((combined) => generate(client, input, combined), {
    task: "tickets",
    attempt: input.repair ? "repair" : "first",
    deadlineMs: options.deadlineMs ?? TICKET_GENERATION_DEADLINE_MS,
    signal,
    toError: (code) => ({ type: "error", error: ticketError(code) }),
  });
}
