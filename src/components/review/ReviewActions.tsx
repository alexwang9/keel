"use client";

import { useId, useState, type SyntheticEvent } from "react";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/review/inputs";
import type { Result } from "@/lib/result";
import type { SpecDraft } from "@/lib/spec/schema";
import { summarizeDraft } from "@/lib/spec/summary";

/** What still blocks approval, as readable lines. */
export function blockers(draft: SpecDraft): string[] {
  const fields = summarizeDraft(draft)
    .filter((row) => row.status === "missing" || row.status === "incomplete")
    .map((row) => (row.preview ? `${row.label}: ${row.preview}` : `${row.label}: not answered`));
  const questions = draft.openQuestions?.length ?? 0;
  const open =
    questions > 0 ? [`${String(questions)} open question(s) to resolve in the interview`] : [];
  return [...fields, ...open];
}

interface ApproveBarProps {
  complete: boolean;
  blockers: string[];
  onApprove: () => void;
}

/** Approve, enabled only for a complete spec, with what's missing when it isn't. */
export function ApproveBar({ complete, blockers: missing, onApprove }: ApproveBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          disabled={!complete}
          onClick={onApprove}
          className={primaryButtonClass}
        >
          Approve spec
        </button>
      </div>
      {!complete && (
        <div role="status" className="text-sm text-amber-800 dark:text-amber-300">
          <p>Approve is available once the spec is complete. Still needed:</p>
          <ul className="list-disc pl-5">
            {missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface BackToInterviewProps {
  edits: string[];
  onSend: (note: string) => Result<void, string>;
}

/**
 * Resumes the interview with one appended message: an optional note plus a description of every
 * edit made since the interview last saw the spec.
 */
export function BackToInterview({ edits, onSend }: BackToInterviewProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={buttonClass}
      >
        Back to interview
      </button>
    );
  }

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = onSend(note);
    if (!result.ok) setError(result.error);
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Back to interview"
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <label htmlFor={noteId} className="text-sm font-medium">
        Note for the interviewer (optional)
      </label>
      <textarea
        id={noteId}
        value={note}
        rows={3}
        onChange={(event) => {
          setNote(event.target.value);
          setError(null);
        }}
        className={inputClass}
      />
      {edits.length === 0 ? (
        <p className="text-sm text-zinc-500">No edits since the interview.</p>
      ) : (
        <details className="text-sm">
          <summary>
            {edits.length === 1 ? "1 edit" : `${String(edits.length)} edits`} will be described to
            the interviewer
          </summary>
          <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
            {edits.map((line) => (
              <li key={line} className="whitespace-pre-wrap">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass}>
          Send and resume
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
          className={buttonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
