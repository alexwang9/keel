"use client";

import { useId, useState, type ReactNode, type SyntheticEvent } from "react";
import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import type { Result } from "@/lib/result";
import type { SpecOp } from "@/lib/spec/schema";

export type SaveEdit = (ops: SpecOp[]) => Result<void, string[]>;

interface EditableSectionProps<T> {
  title: string;
  // The read-only view, shown while not editing.
  children: ReactNode;
  // The form's starting value, taken when Edit is clicked.
  initial: () => T;
  // Readable problems with the form value; Save is disabled while there are any.
  validate: (value: T) => string[];
  // The patch for a valid value. Empty means nothing changed.
  toOps: (value: T) => SpecOp[];
  onSave: SaveEdit;
  renderForm: (value: T, onChange: (value: T) => void) => ReactNode;
  // List items sit inside a section, so they use h3 and drop the outer card.
  nested?: boolean;
  // Extra header buttons shown next to Edit, e.g. Remove.
  actions?: ReactNode;
  // Opens the form on mount, for a new item. `onClose` runs on Save and on Cancel.
  startOpen?: boolean;
  onClose?: () => void;
}

interface Editing<T> {
  value: T;
  touched: boolean;
  saveErrors: string[];
}

/**
 * One spec section: a read view with an Edit button, and a form that validates as you type and
 * saves its patch through `onSave`. A rejected patch keeps the form open with the errors.
 */
export function EditableSection<T>(props: EditableSectionProps<T>) {
  const { title, children, initial, validate, toOps, onSave, renderForm, nested = false } = props;
  const [editing, setEditing] = useState<Editing<T> | null>(() =>
    props.startOpen ? { value: initial(), touched: false, saveErrors: [] } : null,
  );
  const headingId = useId();
  const Heading = nested ? "h3" : "h2";

  const close = () => {
    setEditing(null);
    props.onClose?.();
  };

  const problems = editing ? validate(editing.value) : [];
  const shown = editing?.touched
    ? [...problems, ...editing.saveErrors]
    : (editing?.saveErrors ?? []);

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!editing || problems.length > 0) return;
    const ops = toOps(editing.value);
    const result = ops.length === 0 ? ({ ok: true, value: undefined } as const) : onSave(ops);
    if (result.ok) close();
    else setEditing({ ...editing, touched: true, saveErrors: result.error });
  };

  return (
    <section
      aria-labelledby={headingId}
      className={
        nested
          ? "flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
          : "flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      }
    >
      <header className="flex items-baseline justify-between gap-2">
        <Heading id={headingId} className={nested ? "font-medium" : "font-semibold"}>
          {title}
        </Heading>
        {!editing && (
          <div className="flex gap-1">
            {props.actions}
            <button
              type="button"
              aria-label={`Edit ${title}`}
              onClick={() => {
                setEditing({ value: initial(), touched: false, saveErrors: [] });
              }}
              className={buttonClass}
            >
              Edit
            </button>
          </div>
        )}
      </header>
      {editing ? (
        <form onSubmit={save} aria-label={`Edit ${title}`} className="flex flex-col gap-3">
          {renderForm(editing.value, (value) => {
            setEditing({ value, touched: true, saveErrors: [] });
          })}
          {shown.length > 0 && (
            <ul role="alert" className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">
              {shown.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={problems.length > 0} className={primaryButtonClass}>
              Save
            </button>
            <button type="button" onClick={close} className={buttonClass}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
      )}
    </section>
  );
}
