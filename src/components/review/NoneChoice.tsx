"use client";

import { useId, type ReactNode } from "react";
import { EditableSection, type SaveEdit } from "@/components/review/EditableSection";
import { TextInput } from "@/components/review/inputs";
import { issuesFor } from "@/components/review/issues";
import { err } from "@/lib/result";
import { LIMITS, type SpecOp } from "@/lib/spec/schema";
import { boundedText } from "@/lib/validation";

export type NoneField = "dataModel" | "integrations" | "auth";

interface Choice {
  none: boolean;
  // The reason when not needed; for auth, the description when needed.
  text: string;
}

type Current = { none: true; reason: string } | { none: false; description?: string } | undefined;

interface NoneChoiceProps {
  field: NoneField;
  title: string;
  value: Current;
  neededLabel: string;
  noneLabel: string;
  // Items that switching to none would delete; the user confirms first.
  itemCount: number;
  nested?: boolean;
  onSave: SaveEdit;
  children: ReactNode;
}

const reasonText = (current: Current): string => {
  if (!current) return "";
  return current.none ? current.reason : (current.description ?? "");
};

const longText = boundedText(LIMITS.longText);

function toValue(field: NoneField, choice: Choice): SpecOp {
  const text = choice.text.trim();
  if (choice.none) return { op: "set", field, value: { none: true, reason: text } };
  switch (field) {
    case "dataModel":
      return { op: "set", field, value: { none: false, entities: [], relationships: [] } };
    case "integrations":
      return { op: "set", field, value: { none: false, items: [] } };
    case "auth":
      return { op: "set", field, value: { none: false, description: text } };
  }
}

/**
 * Whether a section is needed at all. "Not needed" takes a reason; for auth, "needed" takes a
 * description, while the data model and integrations list their items separately.
 */
export function NoneChoice(props: NoneChoiceProps) {
  const { field, title, value, neededLabel, noneLabel, itemCount, onSave } = props;
  const name = useId();
  const describesNeed = field === "auth";

  const toOps = (choice: Choice): SpecOp[] => {
    const unchanged =
      value?.none === choice.none &&
      (choice.none || describesNeed ? reasonText(value) === choice.text.trim() : true);
    return unchanged ? [] : [toValue(field, choice)];
  };

  const save: SaveEdit = (ops) => {
    const op = ops[0];
    const toNone =
      op?.op === "set" && typeof op.value === "object" && "none" in op.value && op.value.none;
    const message = `This deletes ${String(itemCount)} item(s) from ${title}. Continue?`;
    if (toNone && itemCount > 0 && !window.confirm(message)) {
      return err(["Not saved; the list was kept."]);
    }
    return onSave(ops);
  };

  return (
    <EditableSection
      title={title}
      nested={props.nested}
      initial={(): Choice => ({ none: value?.none ?? false, text: reasonText(value) })}
      validate={(choice) => {
        if (!choice.none && !describesNeed) return [];
        return issuesFor(longText, choice.text, choice.none ? `${title} reason` : title);
      }}
      toOps={toOps}
      onSave={save}
      renderForm={(choice, onChange) => (
        <>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="sr-only">{title}</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                checked={!choice.none}
                onChange={() => {
                  onChange({ none: false, text: describesNeed ? choice.text : "" });
                }}
              />
              {neededLabel}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                checked={choice.none}
                onChange={() => {
                  onChange({ ...choice, none: true });
                }}
              />
              {noneLabel}
            </label>
          </fieldset>
          {(choice.none || describesNeed) && (
            <TextInput
              label={choice.none ? "Reason" : "Description"}
              value={choice.text}
              multiline
              maxLength={LIMITS.longText}
              onChange={(text) => {
                onChange({ ...choice, text });
              }}
            />
          )}
        </>
      )}
    >
      {props.children}
    </EditableSection>
  );
}
