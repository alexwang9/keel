"use client";

import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import { GenerationStatus } from "@/components/tickets/GenerationStatus";
import { TicketList } from "@/components/tickets/TicketList";
import { useTicketGeneration } from "@/components/tickets/useTicketGeneration";
import type { Spec } from "@/lib/spec/schema";
import type { Ticket } from "@/lib/tickets/schema";

export const REGENERATE_CONFIRM =
  "Regenerate tickets? This replaces the current tickets with a new set.";

interface StaleNoticeProps {
  running: boolean;
  onRegenerate: () => void;
}

function StaleNotice({ running, onRegenerate }: StaleNoticeProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <p>The spec has changed since these tickets were generated, so they may be out of date.</p>
      {!running && (
        <div>
          <button type="button" onClick={onRegenerate} className={primaryButtonClass}>
            Regenerate tickets
          </button>
        </div>
      )}
    </div>
  );
}

interface TicketsScreenProps {
  tickets: readonly Ticket[];
  approved: Spec;
  stale: boolean;
  onGenerated: (tickets: Ticket[], source: Spec) => void;
  onEditSpec: () => void;
}

/** The generated tickets, with a stale warning and regeneration when the spec has changed. */
export function TicketsScreen({
  tickets,
  approved,
  stale,
  onGenerated,
  onEditSpec,
}: TicketsScreenProps) {
  const generation = useTicketGeneration(onGenerated);
  const running = generation.state.status === "running";
  const regenerate = () => {
    if (window.confirm(REGENERATE_CONFIRM)) generation.start(approved);
  };

  return (
    <section aria-label="Tickets" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Tickets ({tickets.length})</h1>
        <button type="button" onClick={onEditSpec} disabled={running} className={buttonClass}>
          Edit spec
        </button>
      </div>
      {stale && <StaleNotice running={running} onRegenerate={regenerate} />}
      <GenerationStatus
        state={generation.state}
        onRetry={() => {
          generation.start(approved);
        }}
      />
      <TicketList tickets={tickets} />
    </section>
  );
}
