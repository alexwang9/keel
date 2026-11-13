import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { LlmErrorCode } from "@/lib/llm/error-codes";
import { codeForError, requestIdOf } from "@/lib/llm/errors";
import { logError, logWarn } from "@/lib/log";

// One streamed structured-output call, shared by ticket generation and impact checks.

/** What a call reports while it streams. `text` is the whole answer so far. */
export type StreamProgress =
  | { type: "thinking" }
  // A refusal fallback restarts the answer on another model.
  | { type: "restart" }
  | { type: "text"; text: string };

/** Streams one call as progress and returns the final message. */
export async function* streamStructured(
  client: Anthropic,
  params: Anthropic.Beta.MessageCreateParamsStreaming,
  signal: AbortSignal,
): AsyncGenerator<StreamProgress, Anthropic.Beta.BetaMessage> {
  const stream = client.beta.messages.stream(params, { signal });
  let text = "";
  let thinking = false;
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const { type } = event.content_block;
      if (type === "thinking" && !thinking) {
        thinking = true;
        yield { type: "thinking" };
      }
      if (type === "fallback") {
        text = "";
        yield { type: "restart" };
      }
    }
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      yield { type: "text", text };
    }
  }
  return stream.finalMessage();
}

/** The answer's text. Blocks before the last refusal fallback belong to the declined attempt. */
export function outputText(message: Anthropic.Beta.BetaMessage): string {
  const lastFallback = message.content.findLastIndex((block) => block.type === "fallback");
  return message.content
    .slice(lastFallback + 1)
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

/** Why a finished call's output can't be used, if it can't. Logged under `task`. */
export function stopProblem(
  message: Anthropic.Beta.BetaMessage,
  task: string,
): "refusal" | "max_tokens" | null {
  switch (message.stop_reason) {
    case "refusal":
      logWarn(`${task}.refusal`, {
        model: message.model,
        category: message.stop_details?.category ?? "none",
      });
      return "refusal";
    case "max_tokens":
    case "model_context_window_exceeded":
      logWarn(`${task}.truncated`, { stopReason: message.stop_reason });
      return "max_tokens";
    default:
      return null;
  }
}

export interface DeadlineOptions<E> {
  // Log event prefix, e.g. `tickets`.
  task: string;
  attempt: "first" | "repair";
  deadlineMs: number;
  signal: AbortSignal | undefined;
  toError: (code: LlmErrorCode | "timeout") => E;
}

/**
 * Runs `events` under a deadline. Never throws: failures become one `toError` event, with
 * details in the server log. Stops quietly if `signal` aborts, and reports `timeout` if the
 * deadline passes first.
 */
export async function* withDeadline<E>(
  events: (signal: AbortSignal) => AsyncGenerator<E>,
  options: DeadlineOptions<E>,
): AsyncGenerator<E> {
  const { task, attempt, signal, toError } = options;
  const deadline = AbortSignal.timeout(options.deadlineMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    yield* events(combined);
  } catch (error) {
    if (signal?.aborted) return;
    if (deadline.aborted) {
      logWarn(`${task}.timeout`, { attempt });
      yield toError("timeout");
      return;
    }
    const code = codeForError(error);
    const requestId = requestIdOf(error);
    logError(`${task}.failed`, error, { code, ...(requestId ? { requestId } : {}) });
    yield toError(code);
  }
}
