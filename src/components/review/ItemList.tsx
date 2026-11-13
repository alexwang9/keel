"use client";

import { useState, type ReactNode } from "react";
import { EditableSection, type SaveEdit } from "@/components/review/EditableSection";
import { buttonClass } from "@/components/review/inputs";
import { trimDeep } from "@/components/review/issues";
import { sameValue } from "@/lib/spec/edits";
import { LIMITS, type SpecOp } from "@/lib/spec/schema";

export interface ItemListProps<T extends { id: string }> {
  // Lower case, e.g. "feature" and "features".
  noun: string;
  plural: string;
  items: readonly T[];
  // A blank item with the next free id.
  blank: () => T;
  heading: (item: T) => string;
  validate: (item: T) => string[];
  upsert: (item: T) => SpecOp;
  // The ops that remove an item, or null if the user backed out (e.g. declined a confirm).
  remove: (item: T) => SpecOp[] | null;
  view: (item: T) => ReactNode;
  form: (item: T, onChange: (item: T) => void) => ReactNode;
  onSave: SaveEdit;
  // Disables Add, with the reason shown next to it.
  addBlocked?: string;
}

/** The id'd items of one spec list: each one edits and removes on its own; Add opens a new one. */
export function ItemList<T extends { id: string }>(props: ItemListProps<T>) {
  const { noun, plural, items, blank, heading, validate, upsert, remove, view, form, onSave } =
    props;
  const [adding, setAdding] = useState<T | null>(null);
  const [removeErrors, setRemoveErrors] = useState<string[]>([]);
  const full = items.length >= LIMITS.listItems;

  const section = (item: T, isNew: boolean) => (
    <EditableSection
      key={isNew ? `new-${item.id}` : item.id}
      nested
      title={isNew ? `New ${noun}` : heading(item)}
      initial={() => item}
      validate={validate}
      toOps={(value) => {
        const trimmed = trimDeep(value);
        return !isNew && sameValue(trimmed, item) ? [] : [upsert(trimmed)];
      }}
      onSave={onSave}
      renderForm={form}
      startOpen={isNew}
      onClose={
        isNew
          ? () => {
              setAdding(null);
            }
          : undefined
      }
      actions={
        <button
          type="button"
          aria-label={`Remove ${heading(item)}`}
          onClick={() => {
            const ops = remove(item);
            if (!ops) return;
            const result = onSave(ops);
            setRemoveErrors(result.ok ? [] : result.error);
          }}
          className={buttonClass}
        >
          Remove
        </button>
      }
    >
      {view(item)}
    </EditableSection>
  );

  return (
    <div className="flex flex-col gap-3">
      {removeErrors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">
          {removeErrors.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {items.length === 0 && !adding && <p className="text-zinc-500">No {plural} yet.</p>}
      {items.map((item) => section(item, false))}
      {adding && section(adding, true)}
      {!adding && (
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            disabled={full || props.addBlocked !== undefined}
            onClick={() => {
              setAdding(blank());
            }}
            className={buttonClass}
          >
            Add {noun}
          </button>
          {props.addBlocked && <span className="text-xs text-zinc-500">{props.addBlocked}</span>}
        </div>
      )}
    </div>
  );
}
