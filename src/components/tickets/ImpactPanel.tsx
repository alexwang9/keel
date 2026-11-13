"use client";

import { ErrorNotice } from "@/components/ErrorNotice";
import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import { ProposalReview } from "@/components/tickets/ProposalReview";
import { impactLabel, type ImpactState } from "@/components/tickets/useImpactCheck";
import type { ProposalOp, Ticket } from "@/lib/tickets/schema";

interface ImpactPanelProps {
  state: ImpactState;
  edited: number;
  onCheck: () => void;
  onApply: (basis: Ticket[], ops: ProposalOp[]) => void;
  onClose: () => void;
}

/** The impact check: an offer to run it, its progress or error, then the proposal to review. */
export function ImpactPanel({ state, edited, onCheck, onApply, onClose }: ImpactPanelProps) {
  switch (state.status) {
    case "idle":
      return (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200"
        >
          <p>
            You edited {edited} {edited === 1 ? "ticket" : "tickets"}. Check how the edits affect
            the rest before creating the repo.
          </p>
          <div>
            <button type="button" onClick={onCheck} className={primaryButtonClass}>
              Check impact
            </button>
          </div>
        </div>
      );
    case "running":
      return (
        <p role="status" className="text-sm font-medium">
          {impactLabel(state.phase, state.problems)}
        </p>
      );
    case "error":
      return (
        <div className="flex flex-col gap-2">
          <ErrorNotice error={state.error} onRetry={onCheck} />
          <div>
            <button type="button" onClick={onClose} className={buttonClass}>
              Dismiss
            </button>
          </div>
        </div>
      );
    case "reviewing":
      return (
        <ProposalReview
          basis={state.basis}
          ops={state.ops}
          onApply={(ops) => {
            onApply(state.basis, ops);
          }}
          onDiscard={onClose}
        />
      );
  }
}
