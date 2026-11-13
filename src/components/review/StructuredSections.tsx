import type { ReactNode } from "react";
import type { SpecDraft } from "@/lib/spec/schema";

function ReadSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="font-semibold">{title}</h2>
      <div className="text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
    </section>
  );
}

const unanswered = <p className="text-zinc-500">Not answered yet.</p>;
const none = (reason: string) => <p className="whitespace-pre-wrap">None: {reason}</p>;

export function FeaturesView({ features }: { features: SpecDraft["features"] }) {
  return (
    <ReadSection title="Features">
      {!features || features.length === 0 ? (
        <p className="text-zinc-500">No features yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {features.map((feature) => (
            <li key={feature.id}>
              <p className="font-medium">
                {feature.id}. {feature.title}
              </p>
              <p className="whitespace-pre-wrap">{feature.description}</p>
              {feature.acceptanceChecks.length === 0 ? (
                <p className="text-amber-700 dark:text-amber-400">Needs acceptance checks.</p>
              ) : (
                <ul className="list-disc pl-5">
                  {feature.acceptanceChecks.map((check, index) => (
                    <li key={index}>{check}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </ReadSection>
  );
}

export function DataModelView({ dataModel }: { dataModel: SpecDraft["dataModel"] }) {
  if (!dataModel) return <ReadSection title="Data model">{unanswered}</ReadSection>;
  if (dataModel.none) return <ReadSection title="Data model">{none(dataModel.reason)}</ReadSection>;
  const names = new Map(dataModel.entities.map((entity) => [entity.id, entity.name]));
  return (
    <ReadSection title="Data model">
      <ul className="list-disc pl-5">
        {dataModel.entities.map((entity) => (
          <li key={entity.id}>
            <span className="font-medium">{entity.name}</span>: {entity.description}
            {entity.fields.length > 0 && ` Fields: ${entity.fields.join(", ")}`}
          </li>
        ))}
      </ul>
      {dataModel.relationships.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {dataModel.relationships.map((r) => (
            <li key={r.id}>
              {names.get(r.from) ?? r.from} → {names.get(r.to) ?? r.to} ({r.kind}): {r.description}
            </li>
          ))}
        </ul>
      )}
    </ReadSection>
  );
}

export function IntegrationsView({ integrations }: { integrations: SpecDraft["integrations"] }) {
  const title = "Integrations";
  if (!integrations) return <ReadSection title={title}>{unanswered}</ReadSection>;
  if (integrations.none)
    return <ReadSection title={title}>{none(integrations.reason)}</ReadSection>;
  return (
    <ReadSection title={title}>
      <ul className="list-disc pl-5">
        {integrations.items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.name}</span>: {item.purpose}
          </li>
        ))}
      </ul>
    </ReadSection>
  );
}

export function AuthView({ auth }: { auth: SpecDraft["auth"] }) {
  if (!auth) return <ReadSection title="Auth">{unanswered}</ReadSection>;
  return (
    <ReadSection title="Auth">
      {auth.none ? none(auth.reason) : <p className="whitespace-pre-wrap">{auth.description}</p>}
    </ReadSection>
  );
}
