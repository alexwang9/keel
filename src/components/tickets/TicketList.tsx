"use client";

import { useState } from "react";
import { EditableSection, type SaveEdit } from "@/components/review/EditableSection";
import { buttonClass } from "@/components/review/inputs";
import { trimDeep } from "@/components/review/issues";
import { SIZE_LABELS, TicketForm, ticketIssues } from "@/components/tickets/TicketForm";
import type { Result } from "@/lib/result";
import { sameValue } from "@/lib/spec/edits";
import { formatDagError, type DagError } from "@/lib/tickets/dag";
import { dependentsOf } from "@/lib/tickets/edit";
import { LIMITS, type Ticket } from "@/lib/tickets/schema";

/** The confirmation for deleting a ticket, naming the tickets that would be left dangling. */
export function deleteConfirm(ticket: Ticket, dependents: readonly Ticket[]): string {
  const base = `Delete ${ticket.id} "${ticket.title}"?`;
  if (dependents.length === 0) return base;
  const ids = dependents.map((dependent) => dependent.id).join(", ");
  const verb = dependents.length === 1 ? "depends" : "depend";
  return `${base} ${ids} ${verb} on it, so the dependencies will need fixing before the repo can be created.`;
}

const badgeClass = "rounded-full px-2 py-0.5 text-xs font-medium";

function TicketView({ ticket, edited }: { ticket: Ticket; edited: boolean }) {
  const dependencies =
    ticket.dependsOn.length > 0 ? `Depends on ${ticket.dependsOn.join(", ")}` : "No dependencies";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <span
          title={SIZE_LABELS[ticket.size]}
          className={`${badgeClass} bg-zinc-100 dark:bg-zinc-800`}
        >
          {ticket.size}
        </span>
        {edited && (
          <span
            className={`${badgeClass} bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200`}
          >
            Edited
          </span>
        )}
      </div>
      <p className="whitespace-pre-line">{ticket.description}</p>
      <div>
        <h3 className="font-medium">Acceptance checks</h3>
        <ul className="list-disc pl-5">
          {ticket.acceptanceChecks.map((check, index) => (
            // Checks have no ids; position is their identity (see DECISIONS.md, Phase 1).
            <li key={index}>{check}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-zinc-500">{dependencies}</p>
    </div>
  );
}

function DagProblems({ id, errors }: { id: string; errors: readonly DagError[] }) {
  if (errors.length === 0) return null;
  return (
    <ul
      aria-label={`Dependency problems for ${id}`}
      className="list-disc pl-9 text-sm text-red-700 dark:text-red-400"
    >
      {errors.map((error) => {
        const text = formatDagError(error);
        return <li key={text}>{text}</li>;
      })}
    </ul>
  );
}

export interface TicketListProps {
  tickets: readonly Ticket[];
  // Ids changed since the last check, for the "Edited" badge.
  edited: ReadonlySet<string>;
  dagErrors: ReadonlyMap<string, DagError[]>;
  // A blank ticket with the next free id.
  blank: () => Ticket;
  onSave: (ticket: Ticket) => Result<void, string[]>;
  onDelete: (id: string) => Result<void, string[]>;
  // Editing is off while tickets are being regenerated.
  locked: boolean;
}

/** The tickets in the order given (topological when the graph is valid), each editable. */
export function TicketList(props: TicketListProps) {
  const { tickets, edited, dagErrors, blank, onSave, onDelete, locked } = props;
  const [adding, setAdding] = useState<Ticket | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);

  const save: SaveEdit<Ticket> = ([ticket]) =>
    ticket ? onSave(ticket) : { ok: false, error: ["nothing to save"] };

  const remove = (ticket: Ticket) => {
    if (!window.confirm(deleteConfirm(ticket, dependentsOf(tickets, ticket.id)))) return;
    const result = onDelete(ticket.id);
    setDeleteErrors(result.ok ? [] : result.error);
  };

  const card = (ticket: Ticket, isNew: boolean) => {
    const label = isNew ? "New ticket" : `${ticket.id}: ${ticket.title}`;
    return (
      <li
        key={isNew ? `new-${ticket.id}` : ticket.id}
        aria-label={label}
        className="flex flex-col gap-2"
      >
        <EditableSection<Ticket, Ticket>
          title={label}
          initial={() => ticket}
          validate={ticketIssues}
          toOps={(value) => {
            const trimmed = trimDeep(value);
            return !isNew && sameValue(trimmed, ticket) ? [] : [trimmed];
          }}
          onSave={save}
          renderForm={(value, onChange) => (
            <TicketForm value={value} onChange={onChange} tickets={tickets} />
          )}
          startOpen={isNew}
          locked={locked}
          onClose={
            isNew
              ? () => {
                  setAdding(null);
                }
              : undefined
          }
          actions={
            !isNew ? (
              <button
                type="button"
                aria-label={`Delete ${ticket.id}`}
                onClick={() => {
                  remove(ticket);
                }}
                className={buttonClass}
              >
                Delete
              </button>
            ) : undefined
          }
        >
          <TicketView ticket={ticket} edited={edited.has(ticket.id)} />
        </EditableSection>
        <DagProblems id={ticket.id} errors={dagErrors.get(ticket.id) ?? []} />
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {deleteErrors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">
          {deleteErrors.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {tickets.length === 0 && !adding && <p className="text-sm text-zinc-500">No tickets.</p>}
      <ol className="flex flex-col gap-3">
        {tickets.map((ticket) => card(ticket, false))}
        {adding && card(adding, true)}
      </ol>
      {!adding && !locked && (
        <div>
          <button
            type="button"
            disabled={tickets.length >= LIMITS.tickets}
            onClick={() => {
              setAdding(blank());
            }}
            className={buttonClass}
          >
            Add ticket
          </button>
        </div>
      )}
    </div>
  );
}
