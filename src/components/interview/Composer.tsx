"use client";

import { useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { HISTORY_LIMITS } from "@/lib/llm/interview/history";

interface ComposerProps {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
}

/** Message input. Enter sends, Shift+Enter adds a line. */
export function Composer({ disabled, placeholder, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    if (disabled || trimmed === "") return;
    onSend(trimmed);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
    >
      <textarea
        aria-label="Message"
        value={text}
        maxLength={HISTORY_LIMITS.text}
        rows={2}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={onKeyDown}
        className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        disabled={disabled || trimmed === ""}
        className="h-10 rounded-full bg-zinc-950 px-5 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Send
      </button>
    </form>
  );
}
