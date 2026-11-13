import type { SpecDraft } from "@/lib/spec/schema";
import { summarizeDraft, type FieldStatus } from "@/lib/spec/summary";

interface SpecPanelProps {
  draft: SpecDraft;
}

const STATUS: Record<FieldStatus, { label: string; className: string }> = {
  filled: { label: "Filled", className: "text-emerald-700 dark:text-emerald-400" },
  incomplete: { label: "Incomplete", className: "text-amber-700 dark:text-amber-400" },
  missing: { label: "Missing", className: "text-zinc-500" },
  optional: { label: "Optional", className: "text-zinc-400" },
};

/** The live draft: one row per template field with its status, then the open questions. */
export function SpecPanel({ draft }: SpecPanelProps) {
  const rows = summarizeDraft(draft);
  const done = rows.filter((row) => row.status === "filled").length;
  const questions = draft.openQuestions ?? [];

  return (
    <aside
      aria-label="Spec draft"
      className="flex flex-col gap-4 overflow-y-auto border-l border-zinc-200 p-6 dark:border-zinc-800"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">Spec</h2>
        <span className="text-xs text-zinc-500">
          {done} of {rows.length} filled
        </span>
      </header>
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map((row) => (
          <div key={row.key} data-status={row.status}>
            <dt className="flex justify-between gap-2 font-medium">
              {row.label}
              <span className={`text-xs font-normal ${STATUS[row.status].className}`}>
                {STATUS[row.status].label}
              </span>
            </dt>
            {row.preview && (
              <dd className="mt-0.5 text-zinc-600 dark:text-zinc-400">{row.preview}</dd>
            )}
          </div>
        ))}
      </dl>
      <section aria-label="Open questions" className="text-sm">
        <h3 className="font-medium">Open questions</h3>
        {questions.length === 0 ? (
          <p className="text-zinc-500">None right now.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
            {questions.map((question) => (
              <li key={question.id}>{question.question}</li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
