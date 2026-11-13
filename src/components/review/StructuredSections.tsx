"use client";

import type { ReactNode } from "react";
import type { SaveEdit } from "@/components/review/EditableSection";
import { TextInput, TextListInput } from "@/components/review/inputs";
import { issuesFor } from "@/components/review/issues";
import { ItemList } from "@/components/review/ItemList";
import { NoneChoice } from "@/components/review/NoneChoice";
import { nextId } from "@/lib/spec/ids";
import {
  FeatureSchema,
  IntegrationSchema,
  LIMITS,
  type Feature,
  type Integration,
  type SpecDraft,
} from "@/lib/spec/schema";

/** A section card whose parts edit separately. */
export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export const confirmRemove = (what: string): boolean => window.confirm(`Remove ${what}?`);

const FEATURE_LABELS = { acceptanceChecks: "acceptance check" };

export function FeaturesSection({ features, onSave }: { features: Feature[]; onSave: SaveEdit }) {
  const heading = (f: Feature) => `${f.id}. ${f.title}`;
  return (
    <SectionCard title="Features">
      <ItemList
        noun="feature"
        plural="features"
        items={features}
        blank={() => ({
          id: nextId(features, "features"),
          title: "",
          description: "",
          acceptanceChecks: [""],
        })}
        heading={heading}
        validate={(f) => issuesFor(FeatureSchema, f, "feature", FEATURE_LABELS)}
        upsert={(item) => ({ op: "upsert", list: "features", item })}
        remove={(f) =>
          confirmRemove(`feature ${heading(f)}`)
            ? [{ op: "remove", list: "features", id: f.id }]
            : null
        }
        onSave={onSave}
        view={(f) => (
          <>
            <p className="whitespace-pre-wrap">{f.description}</p>
            {f.acceptanceChecks.length === 0 ? (
              <p className="text-amber-700 dark:text-amber-400">Needs acceptance checks.</p>
            ) : (
              <ul className="list-disc pl-5">
                {f.acceptanceChecks.map((check, index) => (
                  <li key={index}>{check}</li>
                ))}
              </ul>
            )}
          </>
        )}
        form={(f, onChange) => (
          <>
            <TextInput
              label="Title"
              value={f.title}
              maxLength={LIMITS.shortText}
              onChange={(title) => {
                onChange({ ...f, title });
              }}
            />
            <TextInput
              label="Description"
              value={f.description}
              multiline
              maxLength={LIMITS.longText}
              onChange={(description) => {
                onChange({ ...f, description });
              }}
            />
            <TextListInput
              itemLabel="Acceptance check"
              items={f.acceptanceChecks}
              maxItems={LIMITS.acceptanceChecks}
              maxLength={LIMITS.longText}
              onChange={(acceptanceChecks) => {
                onChange({ ...f, acceptanceChecks });
              }}
            />
          </>
        )}
      />
    </SectionCard>
  );
}

type NeedValue = { none: true; reason: string } | { none: false } | undefined;

/** The read view of a "needed?" choice; `needed` is shown when the section is needed. */
export function needView(value: NeedValue, needed: ReactNode): ReactNode {
  if (!value) return <p className="text-zinc-500">Not answered yet.</p>;
  if (value.none) return <p className="whitespace-pre-wrap">Not needed: {value.reason}</p>;
  return needed;
}

export function IntegrationsSection({
  integrations,
  onSave,
}: {
  integrations: SpecDraft["integrations"];
  onSave: SaveEdit;
}) {
  const items = integrations && !integrations.none ? integrations.items : [];
  const heading = (i: Integration) => i.name;
  return (
    <SectionCard title="Integrations">
      <NoneChoice
        field="integrations"
        title="Integrations needed"
        nested
        value={integrations}
        neededLabel="Yes, list them"
        noneLabel="No external services"
        itemCount={items.length}
        onSave={onSave}
      >
        {needView(integrations, <p>Yes, listed below.</p>)}
      </NoneChoice>
      {integrations && !integrations.none && (
        <ItemList
          noun="integration"
          plural="integrations"
          items={items}
          blank={() => ({ id: nextId(items, "integrations"), name: "", purpose: "" })}
          heading={heading}
          validate={(i) => issuesFor(IntegrationSchema, i, "integration")}
          upsert={(item) => ({ op: "upsert", list: "integrations", item })}
          remove={(i) =>
            confirmRemove(`integration ${i.name}`)
              ? [{ op: "remove", list: "integrations", id: i.id }]
              : null
          }
          onSave={onSave}
          view={(i) => <p className="whitespace-pre-wrap">{i.purpose}</p>}
          form={(i, onChange) => (
            <>
              <TextInput
                label="Name"
                value={i.name}
                maxLength={LIMITS.shortText}
                onChange={(name) => {
                  onChange({ ...i, name });
                }}
              />
              <TextInput
                label="Purpose"
                value={i.purpose}
                multiline
                maxLength={LIMITS.longText}
                onChange={(purpose) => {
                  onChange({ ...i, purpose });
                }}
              />
            </>
          )}
        />
      )}
    </SectionCard>
  );
}

export function AuthSection({ auth, onSave }: { auth: SpecDraft["auth"]; onSave: SaveEdit }) {
  return (
    <NoneChoice
      field="auth"
      title="Auth"
      value={auth}
      neededLabel="Users sign in"
      noneLabel="No sign-in"
      itemCount={0}
      onSave={onSave}
    >
      {needView(
        auth,
        auth?.none === false && <p className="whitespace-pre-wrap">{auth.description}</p>,
      )}
    </NoneChoice>
  );
}
