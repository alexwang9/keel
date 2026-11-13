"use client";

import { EditableSection, type SaveEdit } from "@/components/review/EditableSection";
import { inputClass, TextInput, TextListInput } from "@/components/review/inputs";
import { issuesFor } from "@/components/review/issues";
import { sameValue } from "@/lib/spec/edits";
import { PROJECT_KIND_LABELS } from "@/lib/spec/render";
import {
  LIMITS,
  PROJECT_KINDS,
  ProjectTypeSchema,
  SpecDraftSchema,
  type ProjectType,
  type SpecOp,
} from "@/lib/spec/schema";

export type TextField = "name" | "problem" | "goal" | "targetUsers" | "deploymentTarget";
export type TextListField = "outOfScope" | "constraints";

const fieldSchema = SpecDraftSchema.shape;

interface TextSectionProps {
  field: TextField;
  title: string;
  value: string | undefined;
  onSave: SaveEdit;
}

/** A single text field. The name is one line; the rest are paragraphs. */
export function TextSection({ field, title, value, onSave }: TextSectionProps) {
  const schema = fieldSchema[field].unwrap();
  const short = field === "name";
  return (
    <EditableSection
      title={title}
      initial={() => value ?? ""}
      validate={(text) => issuesFor(schema, text, title)}
      toOps={(text): SpecOp[] =>
        text.trim() === value ? [] : [{ op: "set", field, value: text.trim() }]
      }
      onSave={onSave}
      renderForm={(text, onChange) => (
        <TextInput
          label={title}
          value={text}
          onChange={onChange}
          multiline={!short}
          maxLength={short ? LIMITS.shortText : LIMITS.longText}
        />
      )}
    >
      {value === undefined ? (
        <p className="text-zinc-500">Not answered yet.</p>
      ) : (
        <p className="whitespace-pre-wrap">{value}</p>
      )}
    </EditableSection>
  );
}

interface TextListSectionProps {
  field: TextListField;
  title: string;
  itemLabel: string;
  value: string[] | undefined;
  onSave: SaveEdit;
}

/** A list of strings that may be empty: out of scope and constraints. */
export function TextListSection({ field, title, itemLabel, value, onSave }: TextListSectionProps) {
  const schema = fieldSchema[field].unwrap();
  const current = value ?? [];
  return (
    <EditableSection
      title={title}
      initial={() => current}
      validate={(items) => issuesFor(schema, items, itemLabel)}
      toOps={(items): SpecOp[] => {
        const trimmed = items.map((item) => item.trim());
        return sameValue(trimmed, current) ? [] : [{ op: "set", field, value: trimmed }];
      }}
      onSave={onSave}
      renderForm={(items, onChange) => (
        <TextListInput
          itemLabel={itemLabel}
          items={items}
          onChange={onChange}
          maxItems={LIMITS.listItems}
          maxLength={LIMITS.longText}
        />
      )}
    >
      {current.length === 0 ? (
        <p className="text-zinc-500">None.</p>
      ) : (
        <ul className="list-disc pl-5">
          {current.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </EditableSection>
  );
}

interface ProjectTypeSectionProps {
  value: ProjectType | undefined;
  onSave: SaveEdit;
}

const EMPTY_TYPE: ProjectType = { kind: "web-app", detail: "" };

export function ProjectTypeSection({ value, onSave }: ProjectTypeSectionProps) {
  return (
    <EditableSection
      title="Project type"
      initial={() => value ?? EMPTY_TYPE}
      validate={(type) => issuesFor(ProjectTypeSchema, type, "Project type")}
      toOps={(type): SpecOp[] => {
        const next = { kind: type.kind, detail: type.detail.trim() };
        return sameValue(next, value) ? [] : [{ op: "set", field: "projectType", value: next }];
      }}
      onSave={onSave}
      renderForm={(type, onChange) => (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Kind
            <select
              value={type.kind}
              onChange={(event) => {
                const kind = PROJECT_KINDS.find((option) => option === event.target.value);
                if (kind) onChange({ ...type, kind });
              }}
              className={inputClass}
            >
              {PROJECT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PROJECT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <TextInput
            label="Detail"
            value={type.detail}
            multiline
            maxLength={LIMITS.longText}
            onChange={(detail) => {
              onChange({ ...type, detail });
            }}
          />
        </>
      )}
    >
      {value === undefined ? (
        <p className="text-zinc-500">Not answered yet.</p>
      ) : (
        <p className="whitespace-pre-wrap">
          <span className="font-medium">{PROJECT_KIND_LABELS[value.kind]}</span>: {value.detail}
        </p>
      )}
    </EditableSection>
  );
}
