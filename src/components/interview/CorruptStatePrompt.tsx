"use client";

import { useState } from "react";

interface CorruptStatePromptProps {
  raw: string;
  reasons: readonly string[];
  onReset: () => void;
}

const MAX_REASONS = 5;

function download(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "keel-saved-project.json";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Shown when the saved project can't be read. The data is never dropped silently: the user can
 * download it as is, and Reset unlocks once they have, or once they confirm they don't need it.
 */
export function CorruptStatePrompt({ raw, reasons, onReset }: CorruptStatePromptProps) {
  const [exported, setExported] = useState(false);

  const reset = () => {
    if (exported || window.confirm("Discard the saved project without downloading it?")) {
      onReset();
    }
  };

  return (
    <section
      role="alert"
      className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-24 text-sm text-zinc-700 dark:text-zinc-300"
    >
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        Keel couldn&apos;t read your saved project
      </h1>
      <p>
        It may have been saved by a different version of Keel. Download a copy before resetting, so
        nothing is lost.
      </p>
      <details>
        <summary className="cursor-pointer">Details</summary>
        <ul className="mt-2 list-disc pl-5 font-mono text-xs">
          {reasons.slice(0, MAX_REASONS).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            download(raw);
            setExported(true);
          }}
          className="h-10 rounded-full bg-zinc-950 px-5 font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded-full border border-zinc-300 px-5 font-medium dark:border-zinc-700"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
