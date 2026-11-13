"use client";

import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import { CreateGate } from "@/components/tickets/CreateGate";
import { GenerationStatus } from "@/components/tickets/GenerationStatus";
import { TicketList } from "@/components/tickets/TicketList";
import { useTicketGeneration } from "@/components/tickets/useTicketGeneration";
import type { Result } from "@/lib/result";
import type { Spec } from "@/lib/spec/schema";
import { validateDag } from "@/lib/tickets/dag";
import { dagErrorsByTicket, newTicketId, uncheckedTicketIds } from "@/lib/tickets/edit";
import type { Ticket } from "@/lib/tickets/schema";

export const REGENERATE_CONFIRM =
  "Regenerate tickets? This replaces the current tickets with a new set.";

const REGENERATE_EDITED_CONFIRM = `${REGENERATE_CONFIRM} Your edits to the tickets will be lost.`;

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

const blankTicket = (id: string): Ticket => ({
  id,
  title: "",
  description: "",
  acceptanceChecks: [""],
  size: "M",
  dependsOn: [],
});

interface TicketsScreenProps {
  tickets: readonly Ticket[];
  // The list as of the last impact check, for edit tracking.
  checked: readonly Ticket[];
  approved: Spec;
  stale: boolean;
  // Why the repo can't be created yet (`createBlockers`).
  blockers: readonly string[];
  onGenerated: (tickets: Ticket[], source: Spec) => void;
  onEditSpec: () => void;
  onSaveTicket: (ticket: Ticket) => Result<void, string[]>;
  onDeleteTicket: (id: string) => Result<void, string[]>;
}

/**
 * The ticket list: edit, add and delete tickets, with dependency problems on the tickets involved,
 * a stale warning when the spec has changed, and what's blocking repo creation.
 */
export function TicketsScreen(props: TicketsScreenProps) {
  const { tickets, checked, approved, stale } = props;
  const generation = useTicketGeneration(props.onGenerated);
  const running = generation.state.status === "running";
  const edited = new Set(uncheckedTicketIds(checked, tickets));
  const dag = validateDag(tickets);
  const regenerate = () => {
    const message = edited.size > 0 ? REGENERATE_EDITED_CONFIRM : REGENERATE_CONFIRM;
    if (window.confirm(message)) generation.start(approved);
  };

  return (
    <section aria-label="Tickets" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Tickets ({tickets.length})</h1>
        <button type="button" onClick={props.onEditSpec} disabled={running} className={buttonClass}>
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
      <CreateGate blockers={props.blockers} />
      <TicketList
        tickets={tickets}
        edited={edited}
        dagErrors={dag.ok ? new Map() : dagErrorsByTicket(dag.error)}
        blank={() => blankTicket(newTicketId(tickets, checked))}
        onSave={props.onSaveTicket}
        onDelete={props.onDeleteTicket}
        locked={running}
      />
    </section>
  );
}
