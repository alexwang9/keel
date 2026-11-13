"use client";

import type { SaveEdit } from "@/components/review/EditableSection";
import { inputClass, TextInput, TextListInput } from "@/components/review/inputs";
import { issuesFor } from "@/components/review/issues";
import { ItemList } from "@/components/review/ItemList";
import { NoneChoice } from "@/components/review/NoneChoice";
import { SectionCard, needView } from "@/components/review/StructuredSections";
import { nextId } from "@/lib/spec/ids";
import {
  EntitySchema,
  LIMITS,
  RelationshipSchema,
  type Entity,
  type Relationship,
  type SpecDraft,
  type SpecOp,
} from "@/lib/spec/schema";

const KINDS: Relationship["kind"][] = ["one-to-one", "one-to-many", "many-to-many"];

interface SelectProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}

function Select<V extends string>({ label, value, options, onChange }: SelectProps<V>) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label}
      <select
        value={value}
        onChange={(event) => {
          const picked = options.find((option) => option.value === event.target.value);
          if (picked) onChange(picked.value);
        }}
        className={inputClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Removing an entity also removes the relationships that point at it, after a confirm. */
export function entityRemoval(entity: Entity, relationships: Relationship[]): SpecOp[] | null {
  const linked = relationships.filter((r) => r.from === entity.id || r.to === entity.id);
  const also =
    linked.length === 0 ? "" : ` and its relationships (${linked.map((r) => r.id).join(", ")})`;
  if (!window.confirm(`Remove entity ${entity.name}${also}?`)) return null;
  return [
    ...linked.map((r): SpecOp => ({ op: "remove", list: "relationships", id: r.id })),
    { op: "remove", list: "entities", id: entity.id },
  ];
}

function EntityList({ entities, relationships, onSave }: Model & { onSave: SaveEdit }) {
  return (
    <ItemList
      noun="entity"
      plural="entities"
      items={entities}
      blank={() => ({ id: nextId(entities, "entities"), name: "", description: "", fields: [] })}
      heading={(e) => e.name}
      validate={(e) => issuesFor(EntitySchema, e, "entity", { fields: "field" })}
      upsert={(item) => ({ op: "upsert", list: "entities", item })}
      remove={(e) => entityRemoval(e, relationships)}
      onSave={onSave}
      view={(e) => (
        <p className="whitespace-pre-wrap">
          {e.description}
          {e.fields.length > 0 && ` Fields: ${e.fields.join(", ")}`}
        </p>
      )}
      form={(e, onChange) => (
        <>
          <TextInput
            label="Name"
            value={e.name}
            maxLength={LIMITS.shortText}
            onChange={(name) => {
              onChange({ ...e, name });
            }}
          />
          <TextInput
            label="Description"
            value={e.description}
            multiline
            maxLength={LIMITS.longText}
            onChange={(description) => {
              onChange({ ...e, description });
            }}
          />
          <TextListInput
            itemLabel="Field"
            items={e.fields}
            maxItems={LIMITS.listItems}
            maxLength={LIMITS.shortText}
            onChange={(fields) => {
              onChange({ ...e, fields });
            }}
          />
        </>
      )}
    />
  );
}

function RelationshipList({ entities, relationships, onSave }: Model & { onSave: SaveEdit }) {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const heading = (r: Relationship) => `${r.id}: ${nameOf(r.from)} → ${nameOf(r.to)}`;
  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));
  const first = entities[0]?.id ?? "E1";
  return (
    <ItemList
      noun="relationship"
      plural="relationships"
      items={relationships}
      blank={(): Relationship => ({
        id: nextId(relationships, "relationships"),
        from: first,
        to: first,
        kind: "one-to-many",
        description: "",
      })}
      heading={heading}
      validate={(r) => issuesFor(RelationshipSchema, r, "relationship")}
      upsert={(item) => ({ op: "upsert", list: "relationships", item })}
      remove={(r) =>
        window.confirm(`Remove relationship ${heading(r)}?`)
          ? [{ op: "remove", list: "relationships", id: r.id }]
          : null
      }
      onSave={onSave}
      addBlocked={entities.length === 0 ? "Add an entity first." : undefined}
      view={(r) => (
        <p className="whitespace-pre-wrap">
          {r.kind}: {r.description}
        </p>
      )}
      form={(r, onChange) => (
        <>
          <Select
            label="From"
            value={r.from}
            options={entityOptions}
            onChange={(from) => {
              onChange({ ...r, from });
            }}
          />
          <Select
            label="To"
            value={r.to}
            options={entityOptions}
            onChange={(to) => {
              onChange({ ...r, to });
            }}
          />
          <Select
            label="Kind"
            value={r.kind}
            options={KINDS.map((kind) => ({ value: kind, label: kind }))}
            onChange={(kind) => {
              onChange({ ...r, kind });
            }}
          />
          <TextInput
            label="Description"
            value={r.description}
            multiline
            maxLength={LIMITS.longText}
            onChange={(description) => {
              onChange({ ...r, description });
            }}
          />
        </>
      )}
    />
  );
}

interface Model {
  entities: Entity[];
  relationships: Relationship[];
}

export function DataModelSection({
  dataModel,
  onSave,
}: {
  dataModel: SpecDraft["dataModel"];
  onSave: SaveEdit;
}) {
  const model: Model =
    dataModel && !dataModel.none ? dataModel : { entities: [], relationships: [] };
  return (
    <SectionCard title="Data model">
      <NoneChoice
        field="dataModel"
        title="Data model needed"
        nested
        value={dataModel}
        neededLabel="Yes, it stores data"
        noneLabel="No stored data"
        itemCount={model.entities.length + model.relationships.length}
        onSave={onSave}
      >
        {needView(dataModel, <p>Yes, entities and relationships below.</p>)}
      </NoneChoice>
      {dataModel && !dataModel.none && (
        <>
          <h3 className="font-medium">Entities</h3>
          <EntityList {...model} onSave={onSave} />
          <h3 className="font-medium">Relationships</h3>
          <RelationshipList {...model} onSave={onSave} />
        </>
      )}
    </SectionCard>
  );
}
