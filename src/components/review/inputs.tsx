"use client";

import { useId } from "react";

export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export const buttonClass =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-40 dark:border-zinc-700";

export const primaryButtonClass =
  "rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950";

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}

/** A labelled text input or textarea. */
export function TextInput({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
}: TextInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={4}
          maxLength={maxLength}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={inputClass}
        />
      )}
    </div>
  );
}

interface TextListInputProps {
  // Singular, e.g. "Constraint"; rows are labelled "Constraint 1", "Constraint 2", …
  itemLabel: string;
  items: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength?: number;
}

/** An editable list of strings: edit, add, remove and reorder rows. */
export function TextListInput({
  itemLabel,
  items,
  onChange,
  maxItems,
  maxLength,
}: TextListInputProps) {
  const move = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const label = `${itemLabel} ${String(index + 1)}`;
        return (
          // Rows have no ids; position is their identity while the form is open.
          <div key={index} className="flex items-center gap-1">
            <input
              type="text"
              aria-label={label}
              value={item}
              maxLength={maxLength}
              onChange={(event) => {
                onChange(items.with(index, event.target.value));
              }}
              className={inputClass}
            />
            <button
              type="button"
              aria-label={`Move ${label} up`}
              disabled={index === 0}
              onClick={() => {
                move(index, index - 1);
              }}
              className={buttonClass}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${label} down`}
              disabled={index === items.length - 1}
              onClick={() => {
                move(index, index + 1);
              }}
              className={buttonClass}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => {
                onChange(items.filter((_, other) => other !== index));
              }}
              className={buttonClass}
            >
              Remove
            </button>
          </div>
        );
      })}
      <div>
        <button
          type="button"
          disabled={items.length >= maxItems}
          onClick={() => {
            onChange([...items, ""]);
          }}
          className={buttonClass}
        >
          Add {itemLabel.toLowerCase()}
        </button>
      </div>
    </div>
  );
}
