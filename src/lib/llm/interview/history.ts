import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { INTERVIEW_TOOL_NAMES } from "@/lib/llm/interview/tools";
import { LIMITS, type TranscriptMessage } from "@/lib/spec/schema";

/**
 * The raw interview history the client stores and sends back with every turn. It keeps thinking
 * blocks (with signatures), tool calls and tool results, because the API requires an append-only
 * history. Only the block types the interview produces are accepted.
 */
export const HISTORY_LIMITS = {
  messages: 600,
  blocksPerMessage: 50,
  text: LIMITS.transcriptText,
  // Thinking text and signatures are model output we pass back untouched; cap them loosely.
  opaque: 200_000,
  toolResult: 20_000,
  id: 200,
} as const;

const opaque = z.string().max(HISTORY_LIMITS.opaque);
const id = z.string().min(1).max(HISTORY_LIMITS.id);

const TextBlock = z.object({ type: z.literal("text"), text: z.string().max(HISTORY_LIMITS.text) });
const ThinkingBlock = z.object({
  type: z.literal("thinking"),
  thinking: opaque,
  signature: opaque,
});
const RedactedThinkingBlock = z.object({ type: z.literal("redacted_thinking"), data: opaque });
const ToolUseBlock = z.object({
  type: z.literal("tool_use"),
  id,
  name: z.enum(INTERVIEW_TOOL_NAMES),
  input: z.record(z.string(), z.unknown()),
});
const FallbackBlock = z.object({
  type: z.literal("fallback"),
  from: z.object({ model: id }),
  to: z.object({ model: id }),
  trigger: z.unknown().optional(),
});
const ToolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: id,
  content: z.string().max(HISTORY_LIMITS.toolResult),
  is_error: z.boolean().optional(),
});

const blocks = <T extends z.ZodType>(block: T) =>
  z.array(block).min(1).max(HISTORY_LIMITS.blocksPerMessage);

const UserMessage = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string().min(1).max(HISTORY_LIMITS.text),
    blocks(z.discriminatedUnion("type", [TextBlock, ToolResultBlock])),
  ]),
});

const AssistantMessage = z.object({
  role: z.literal("assistant"),
  content: blocks(
    z.discriminatedUnion("type", [
      TextBlock,
      ThinkingBlock,
      RedactedThinkingBlock,
      ToolUseBlock,
      FallbackBlock,
    ]),
  ),
});

export const HistoryMessageSchema = z.discriminatedUnion("role", [UserMessage, AssistantMessage]);

export const HistorySchema = z
  .array(HistoryMessageSchema)
  .min(1)
  .max(HISTORY_LIMITS.messages)
  .refine((history) => history[0]?.role === "user", "must start with a user message")
  .refine((history) => history.at(-1)?.role === "user", "must end with a user message");

export type HistoryMessage = z.infer<typeof HistoryMessageSchema>;
export type AssistantContent = z.infer<typeof AssistantMessage>["content"];
type AssistantBlock = AssistantContent[number];

function toHistoryBlock(block: Anthropic.Beta.BetaContentBlock): AssistantBlock | null {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "thinking":
      return { type: "thinking", thinking: block.thinking, signature: block.signature };
    case "redacted_thinking":
      return { type: "redacted_thinking", data: block.data };
    case "tool_use": {
      const name = z.enum(INTERVIEW_TOOL_NAMES).safeParse(block.name);
      const input = z.record(z.string(), z.unknown()).safeParse(block.input);
      if (!name.success || !input.success) return null;
      return { type: "tool_use", id: block.id, name: name.data, input: input.data };
    }
    case "fallback":
      return { type: "fallback", from: block.from, to: block.to, trigger: block.trigger };
    default:
      // The interview uses no server tools, so nothing else should appear.
      return null;
  }
}

/**
 * The assistant content to append to the history, per the fallback rules: after a mid-output
 * refusal fallback, only text blocks from before the last `fallback` block are sent back, because
 * the declined model's thinking and tool calls are not part of the continued turn.
 */
export function toHistoryContent(
  content: readonly Anthropic.Beta.BetaContentBlock[],
): AssistantContent {
  const boundary = content.findLastIndex((block) => block.type === "fallback");
  return content
    .filter((block, index) => index >= boundary || block.type === "text")
    .map(toHistoryBlock)
    .filter((block) => block !== null);
}

function visibleText(message: HistoryMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n\n")
    .trim();
}

/** The visible conversation for `docs/interview.md`: text only, consecutive turns merged. */
export function toTranscript(history: readonly HistoryMessage[]): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = [];
  for (const message of history) {
    const text = visibleText(message);
    if (text === "") continue;
    const last = transcript.at(-1);
    if (last?.role === message.role) {
      transcript[transcript.length - 1] = { role: last.role, text: `${last.text}\n\n${text}` };
    } else {
      transcript.push({ role: message.role, text });
    }
  }
  return transcript;
}
