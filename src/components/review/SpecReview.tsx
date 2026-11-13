"use client";

import { useId, useState } from "react";
import type { SaveEdit } from "@/components/review/EditableSection";
import { ApproveBar, BackToInterview, blockers } from "@/components/review/ReviewActions";
import { SpecForm } from "@/components/review/SpecForm";
import type { Result } from "@/lib/result";
import { isSpecComplete } from "@/lib/spec/complete";
import { describeSpecEdits } from "@/lib/spec/edits";
import { renderSpecMarkdown } from "@/lib/spec/render";
import type { Spec, SpecDraft } from "@/lib/spec/schema";

type Tab = "edit" | "preview";

interface SpecReviewProps {
  draft: SpecDraft;
  // The spec the interview last saw; edits are described against it.
  baseline: Spec | null;
  onSave: SaveEdit;
  onApprove: () => void;
  onBackToInterview: (note: string) => Result<void, string>;
}

export function SpecMarkdown({ spec }: { spec: Spec }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-zinc-100 p-4 text-sm whitespace-pre-wrap dark:bg-zinc-900">
      {renderSpecMarkdown(spec)}
    </pre>
  );
}

/** Review screen: edit the spec in a form, preview SPEC.md, approve or return to the interview. */
export function SpecReview({
  draft,
  baseline,
  onSave,
  onApprove,
  onBackToInterview,
}: SpecReviewProps) {
  const [tab, setTab] = useState<Tab>("edit");
  const panelId = useId();
  const completeness = isSpecComplete(draft);
  const edits = describeSpecEdits(baseline ?? {}, draft);

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      aria-controls={panelId}
      onClick={() => {
        setTab(value);
      }}
      className={`rounded-full px-3 py-1 text-sm ${tab === value ? "bg-zinc-200 font-medium dark:bg-zinc-800" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Spec review" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Review your spec</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Edit anything below, then approve it. Approving is what tickets will be generated from.
        </p>
        <ApproveBar
          complete={completeness.complete}
          blockers={completeness.complete ? [] : blockers(draft)}
          onApprove={onApprove}
        />
        <div>
          <BackToInterview edits={edits} onSend={onBackToInterview} />
        </div>
      </header>
      <div role="tablist" aria-label="Spec view" className="flex gap-1">
        {tabButton("edit", "Edit")}
        {tabButton("preview", "Preview SPEC.md")}
      </div>
      <div id={panelId} role="tabpanel">
        {tab === "edit" && <SpecForm draft={draft} onSave={onSave} />}
        {tab === "preview" &&
          (completeness.complete ? (
            <SpecMarkdown spec={completeness.spec} />
          ) : (
            <p className="text-sm text-zinc-500">The preview appears once the spec is complete.</p>
          ))}
      </div>
    </section>
  );
}
