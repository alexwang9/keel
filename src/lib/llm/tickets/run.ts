import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_BETA, LLM_TASKS, TICKET_GENERATION_DEADLINE_MS } from "@/lib/llm/config";
import { codeForError, requestIdOf, ticketError } from "@/lib/llm/errors";
import { MAX_REPAIR_OUTPUT_CHARS, type TicketEvent } from "@/lib/llm/tickets/events";
import { parseTicketOutput, ticketCounter, ticketOutputFormat } from "@/lib/llm/tickets/output";
import { TICKET_SYSTEM_PROMPT, ticketMessages } from "@/lib/llm/tickets/prompt";
import type { TicketRequest } from "@/lib/llm/tickets/request";
import { logError, logWarn } from "@/lib/log";
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
  const stream = client.beta.messages.stream(requestParams(input), { signal });
  let count = ticketCounter();
  let text = "";
  let drafted = 0;
  let thinking = false;
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const { type } = event.content_block;
      if (type === "thinking" && !thinking) {
        thinking = true;
        yield { type: "thinking" };
      }
      // A refusal fallback restarts the answer on another model: count from scratch.
      if (type === "fallback") {
        count = ticketCounter();
        text = "";
      }
    }
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      const seen = count(text);
      if (seen !== drafted) {
        drafted = seen;
        yield { type: "drafting", count: seen };
      }
    }
  }
  return stream.finalMessage();
}

/** The answer's text. Blocks before the last refusal fallback belong to the declined attempt. */
function outputText(message: Anthropic.Beta.BetaMessage): string {
  const lastFallback = message.content.findLastIndex((block) => block.type === "fallback");
  return message.content
    .slice(lastFallback + 1)
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

/** Why a finished call's output can't be used, if it can't. */
function stopProblem(message: Anthropic.Beta.BetaMessage): TicketEvent | null {
  switch (message.stop_reason) {
    case "refusal":
      logWarn("tickets.refusal", {
        model: message.model,
        category: message.stop_details?.category ?? "none",
      });
      return { type: "error", error: ticketError("refusal") };
    case "max_tokens":
    case "model_context_window_exceeded":
      logWarn("tickets.truncated", { stopReason: message.stop_reason });
      return { type: "error", error: ticketError("max_tokens") };
    default:
      return null;
  }
}

async function* generate(
  client: Anthropic,
  input: TicketRequest,
  signal: AbortSignal,
): AsyncGenerator<TicketEvent> {
  yield { type: "started" };
  const message = yield* streamCall(client, input, signal);
  const problem = stopProblem(message);
  if (problem) {
    yield problem;
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
  if (input.repair || output === "" || output.length > MAX_REPAIR_OUTPUT_CHARS) {
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
export async function* runTicketGeneration(
  client: Anthropic,
  input: TicketRequest,
  signal?: AbortSignal,
  options: GenerationOptions = {},
): AsyncGenerator<TicketEvent> {
  const deadline = AbortSignal.timeout(options.deadlineMs ?? TICKET_GENERATION_DEADLINE_MS);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    yield* generate(client, input, combined);
  } catch (error) {
    if (signal?.aborted) return;
    if (deadline.aborted) {
      logWarn("tickets.timeout", { attempt: input.repair ? "repair" : "first" });
      yield { type: "error", error: ticketError("timeout") };
      return;
    }
    const code = codeForError(error);
    const requestId = requestIdOf(error);
    logError("tickets.failed", error, { code, ...(requestId ? { requestId } : {}) });
    yield { type: "error", error: ticketError(code) };
  }
}
