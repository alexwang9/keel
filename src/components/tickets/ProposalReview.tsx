"use client";

import { useState } from "react";
import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import type { ProposalOp, Ticket } from "@/lib/tickets/schema";
import {
  acceptedOps,
  allDecided,
  describeOp,
  previewChanges,
  previewProposal,
  type Decision,
  type Decisions,
} from "@/lib/tickets/review";

const ids = (list: readonly string[]): string => list.join(", ");

/** "Applying adds T5 and changes T4." */
function changesSentence(before: readonly Ticket[], after: readonly Ticket[]): string {
  const { added, changed, deleted } = previewChanges(before, after);
  const parts = [
    ...(added.length > 0 ? [`adds ${ids(added)}`] : []),
    ...(changed.length > 0 ? [`changes ${ids(changed)}`] : []),
    ...(deleted.length > 0 ? [`deletes ${ids(deleted)}`] : []),
  ];
  if (parts.length === 0) return "Applying keeps the tickets as they are and marks them checked.";
  return `Applying ${parts.join(", ")}.`;
}

interface PreviewProps {
  basis: readonly Ticket[];
  ops: readonly ProposalOp[];
  decisions: Decisions;
}

/** What applying the accepted changes would do, or why it can't be applied. */
function Preview({ basis, ops, decisions }: PreviewProps) {
  if (!allDecided(ops, decisions)) {
    const left = ops.filter((_, index) => decisions[index] === undefined).length;
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Decide on {left} more to see the result.</p>
    );
  }
  const result = previewProposal(basis, ops, decisions);
  if (result.ok) return <p>{changesSentence(basis, result.value)}</p>;
  return (
    <div role="alert" className="text-red-700 dark:text-red-400">
      <p>These choices can&apos;t be applied together:</p>
      <ul className="list-disc pl-5">
        {result.error.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

interface OpCardProps {
  number: number;
  label: string;
  reason: string;
  decision: Decision | undefined;
  onDecide: (decision: Decision) => void;
}

function OpCard({ number, label, reason, decision, onDecide }: OpCardProps) {
  const choice = (value: Decision, text: string) => (
    <button
      type="button"
      aria-pressed={decision === value}
      onClick={() => {
        onDecide(value);
      }}
      className={`${buttonClass} aria-pressed:bg-zinc-950 aria-pressed:text-zinc-50 dark:aria-pressed:bg-zinc-50 dark:aria-pressed:text-zinc-950`}
    >
      {text}
    </button>
  );
  return (
    <li
      aria-label={`Change ${String(number)}`}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <p className="font-medium">
        {number}. {label}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">{reason}</p>
      <div className="flex gap-2">
        {choice("accept", "Accept")}
        {choice("reject", "Reject")}
      </div>
    </li>
  );
}

export interface ProposalReviewProps {
  // The tickets the proposal was made for.
  basis: readonly Ticket[];
  ops: readonly ProposalOp[];
  onApply: (accepted: ProposalOp[]) => void;
  onDiscard: () => void;
}

/**
 * The proposed changes, each accepted or rejected on its own. Nothing changes until Apply, which
 * is enabled only once every change is decided and the accepted ones leave a valid list.
 */
export function ProposalReview({ basis, ops, onApply, onDiscard }: ProposalReviewProps) {
  const [decisions, setDecisions] = useState<Decisions>(() => ops.map(() => undefined));
  const decideAll = (decision: Decision) => {
    setDecisions(ops.map(() => decision));
  };
  const ready = allDecided(ops, decisions) && previewProposal(basis, ops, decisions).ok;
  const empty = ops.length === 0;

  return (
    <section
      aria-label="Proposed changes"
      className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900 dark:bg-sky-950"
    >
      <h2 className="font-semibold">{empty ? "No changes needed" : "Proposed changes"}</h2>
      {empty ? (
        <p>Your edits don&apos;t affect the other tickets.</p>
      ) : (
        <>
          <p>Accept or reject each change. Nothing changes until you apply.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                decideAll("accept");
              }}
              className={buttonClass}
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => {
                decideAll("reject");
              }}
              className={buttonClass}
            >
              Reject all
            </button>
          </div>
          <ol className="flex flex-col gap-2">
            {ops.map((op, index) => (
              <OpCard
                // Ops have no ids; position is their identity (see DECISIONS.md, Phase 2).
                key={index}
                number={index + 1}
                label={describeOp(op, basis)}
                reason={op.reason}
                decision={decisions[index]}
                onDecide={(decision) => {
                  setDecisions(decisions.with(index, decision));
                }}
              />
            ))}
          </ol>
        </>
      )}
      <Preview basis={basis} ops={ops} decisions={decisions} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            onApply(acceptedOps(ops, decisions));
          }}
          className={primaryButtonClass}
        >
          {empty ? "Mark as checked" : "Apply"}
        </button>
        <button type="button" onClick={onDiscard} className={buttonClass}>
          Discard
        </button>
      </div>
    </section>
  );
}
