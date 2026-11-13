"use client";

import { TextInput, TextListInput } from "@/components/review/inputs";
import { issuesFor, trimDeep } from "@/components/review/issues";
import { LIMITS, TICKET_SIZES, TicketSchema, type Ticket } from "@/lib/tickets/schema";

export const SIZE_LABELS: Record<Ticket["size"], string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

const LABELS = {
  title: "title",
  description: "description",
  acceptanceChecks: "acceptance check",
  dependsOn: "dependency",
};

/** Readable problems with a ticket form value, e.g. `Ticket title must not be empty`. */
export const ticketIssues = (ticket: Ticket): string[] =>
  issuesFor(TicketSchema, trimDeep(ticket), "Ticket", LABELS);

const legendClass = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

interface SizeChoiceProps {
  value: Ticket["size"];
  onChange: (size: Ticket["size"]) => void;
}

function SizeChoice({ value, onChange }: SizeChoiceProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={legendClass}>Size</legend>
      <div className="flex gap-4 text-sm">
        {TICKET_SIZES.map((size) => (
          <label key={size} className="flex items-center gap-1">
            <input
              type="radio"
              name="size"
              checked={value === size}
              onChange={() => {
                onChange(size);
              }}
            />
            {SIZE_LABELS[size]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface DependencyPickerProps {
  // The other tickets this one may depend on, in list order.
  options: readonly Pick<Ticket, "id" | "title">[];
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Checkboxes for the other tickets. A dependency on a deleted ticket stays listed, marked
 * deleted, so it can be unticked.
 */
function DependencyPicker({ options, value, onChange }: DependencyPickerProps) {
  const known = new Set(options.map((option) => option.id));
  const missing = value.filter((id) => !known.has(id)).map((id) => ({ id, title: null }));
  const rows = [...options, ...missing];
  const toggle = (id: string, on: boolean) => {
    onChange(on ? [...value, id] : value.filter((other) => other !== id));
  };

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={legendClass}>Depends on</legend>
      {rows.length === 0 && <p className="text-sm text-zinc-500">No other tickets yet.</p>}
      {rows.map(({ id, title }) => (
        <label key={id} className="flex items-baseline gap-2 text-sm">
          <input
            type="checkbox"
            aria-label={title === null ? `${id} (deleted)` : `${id}: ${title}`}
            checked={value.includes(id)}
            onChange={(event) => {
              toggle(id, event.target.checked);
            }}
          />
          <span>
            <span className="mr-1 font-mono text-xs text-zinc-500">{id}</span>
            {title ?? <em className="text-red-700 dark:text-red-400">(deleted)</em>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface TicketFormProps {
  value: Ticket;
  onChange: (ticket: Ticket) => void;
  // Every ticket in the list; the ticket being edited is left out of the picker.
  tickets: readonly Ticket[];
}

/** Every ticket field. Cycles aren't prevented here; the dependency check reports them. */
export function TicketForm({ value, onChange, tickets }: TicketFormProps) {
  const set = <K extends keyof Ticket>(key: K) => {
    return (next: Ticket[K]) => {
      onChange({ ...value, [key]: next });
    };
  };
  const options = tickets.filter((ticket) => ticket.id !== value.id);

  return (
    <>
      <TextInput
        label="Title"
        value={value.title}
        onChange={set("title")}
        maxLength={LIMITS.shortText}
      />
      <TextInput
        label="Description"
        value={value.description}
        onChange={set("description")}
        multiline
        maxLength={LIMITS.longText}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className={legendClass}>Acceptance checks</legend>
        <TextListInput
          itemLabel="Acceptance check"
          items={value.acceptanceChecks}
          onChange={set("acceptanceChecks")}
          maxItems={LIMITS.acceptanceChecks}
          maxLength={LIMITS.checkText}
        />
      </fieldset>
      <SizeChoice value={value.size} onChange={set("size")} />
      <DependencyPicker options={options} value={value.dependsOn} onChange={set("dependsOn")} />
    </>
  );
}
