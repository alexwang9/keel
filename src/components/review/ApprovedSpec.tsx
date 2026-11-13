"use client";

import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import { SpecMarkdown } from "@/components/review/SpecReview";
import { GenerationStatus } from "@/components/tickets/GenerationStatus";
import { REGENERATE_CONFIRM } from "@/components/tickets/TicketsScreen";
import { useTicketGeneration } from "@/components/tickets/useTicketGeneration";
import type { Spec } from "@/lib/spec/schema";
import type { Ticket } from "@/lib/tickets/schema";

/** Whether tickets exist for this project, and if so whether they match the approved spec. */
export type TicketStatus = "none" | "current" | "stale";

interface ApprovedSpecProps {
  spec: Spec;
  tickets: TicketStatus;
  onEdit: () => void;
  onGenerated: (tickets: Ticket[], source: Spec) => void;
  onViewTickets: () => void;
}

const COPY: Record<TicketStatus, string> = {
  none: "Next, Keel breaks the spec into tickets with dependencies. Editing the spec reopens review, and it will need approving again.",
  current: "Tickets have been generated from this spec.",
  stale: "The spec has changed since the tickets were generated, so they may be out of date.",
};

/** Shown after approval: generate tickets, or go to the ones that exist. */
export function ApprovedSpec({
  spec,
  tickets,
  onEdit,
  onGenerated,
  onViewTickets,
}: ApprovedSpecProps) {
  const generation = useTicketGeneration(onGenerated);
  const running = generation.state.status === "running";
  const generate = () => {
    if (tickets === "none" || window.confirm(REGENERATE_CONFIRM)) generation.start(spec);
  };

  return (
    <section
      aria-label="Approved spec"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">Spec approved</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{COPY[tickets]}</p>
      {!running && (
        <div className="flex flex-wrap gap-2">
          {tickets === "current" ? (
            <button type="button" onClick={onViewTickets} className={primaryButtonClass}>
              View tickets
            </button>
          ) : (
            <button type="button" onClick={generate} className={primaryButtonClass}>
              {tickets === "none" ? "Generate tickets" : "Regenerate tickets"}
            </button>
          )}
          {tickets === "stale" && (
            <button type="button" onClick={onViewTickets} className={buttonClass}>
              View current tickets
            </button>
          )}
          <button type="button" onClick={onEdit} className={buttonClass}>
            Edit spec
          </button>
        </div>
      )}
      <GenerationStatus
        state={generation.state}
        onRetry={() => {
          generation.start(spec);
        }}
      />
      <SpecMarkdown spec={spec} />
    </section>
  );
}
