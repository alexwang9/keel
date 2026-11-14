"use client";

import { useEffect, useRef } from "react";
import { Composer } from "@/components/interview/Composer";
import { Markdown } from "@/components/Markdown";
import { ErrorNotice } from "@/components/ErrorNotice";
import type { TurnError } from "@/lib/llm/interview/client";
import { toTranscript, type HistoryMessage } from "@/lib/llm/interview/history";
import type { TurnStatus } from "@/lib/state/reducer";

interface ChatPanelProps {
  history: readonly HistoryMessage[];
  streamingText: string;
  status: TurnStatus;
  error: TurnError | null;
  // The stored history ends with a user message that has no reply yet.
  awaitingReply: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
}

const bubble = {
  user: "self-end bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900",
  assistant: "self-start bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
} as const;

function Bubble({ role, text }: { role: keyof typeof bubble; text: string }) {
  return (
    <li
      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-6 ${bubble[role]}`}
      aria-label={role === "user" ? "You" : "Keel"}
    >
      {/* The user's words are shown as typed; the model writes Markdown. */}
      {role === "user" ? <p className="whitespace-pre-wrap">{text}</p> : <Markdown text={text} />}
    </li>
  );
}

/** The conversation, the reply streaming in, and the composer. Tool and thinking blocks stay hidden. */
export function ChatPanel(props: ChatPanelProps) {
  const { history, streamingText, status, error, awaitingReply, onSend, onRetry } = props;
  const endRef = useRef<HTMLLIElement>(null);
  const messages = toTranscript(history);
  const streaming = status === "streaming";

  useEffect(() => {
    // jsdom has no scrollIntoView; browsers always do.
    const end = endRef.current;
    if (end && "scrollIntoView" in end) end.scrollIntoView({ block: "end" });
  }, [messages.length, streamingText]);

  return (
    <section aria-label="Interview" className="flex min-h-0 flex-1 flex-col">
      <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
        {messages.length === 0 && (
          <li className="text-sm text-zinc-600 dark:text-zinc-400">
            Describe the software you want to build. Keel will ask questions until the spec is
            complete.
          </li>
        )}
        {messages.map((message, index) => (
          <Bubble key={index} role={message.role} text={message.text} />
        ))}
        {streaming && <Bubble role="assistant" text={streamingText || "…"} />}
        <li ref={endRef} aria-hidden />
      </ol>
      <div aria-live="polite" className="px-6">
        {error && <ErrorNotice error={error} onRetry={onRetry} />}
        {!error && !streaming && awaitingReply && (
          <ErrorNotice
            error={{
              code: "unknown",
              message: "Your last message didn't get a reply.",
              retryable: true,
            }}
            onRetry={onRetry}
          />
        )}
      </div>
      <Composer
        disabled={streaming}
        placeholder={messages.length === 0 ? "I want to build…" : "Reply…"}
        onSend={onSend}
      />
    </section>
  );
}
