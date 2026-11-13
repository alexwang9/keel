import { bullet, bullets, document, normalize, oneLine } from "@/lib/markdown";
import type { DataModel, Feature, ProjectType, Spec } from "@/lib/spec/schema";

/** First line of every SPEC.md Keel writes. Lets a later run recognise a Keel repo to resume into. */
export const SPEC_MARKER = "<!-- keel:spec v1 -->";

const PROJECT_KIND_LABELS: Record<ProjectType["kind"], string> = {
  "web-app": "Web app",
  "mobile-app": "Mobile app",
  cli: "CLI",
  library: "Library",
  "api-service": "API service",
  "desktop-app": "Desktop app",
  other: "Other",
};

const section = (heading: string, body: string): string => `## ${heading}\n\n${body}`;

const noneLine = (reason: string): string => `None: ${oneLine(reason)}`;

const labelled = (label: string, text: string): string =>
  bullet(`**${oneLine(label)}**: ${normalize(text)}`);

function renderFeature(feature: Feature): string {
  return [
    `### ${feature.id}. ${oneLine(feature.title)}`,
    normalize(feature.description),
    "Acceptance checks:",
    bullets(feature.acceptanceChecks),
  ].join("\n\n");
}

function renderDataModel(model: DataModel): string {
  if (model.none) return noneLine(model.reason);

  const names = new Map(model.entities.map((entity) => [entity.id, oneLine(entity.name)]));
  const nameOf = (id: string): string => names.get(id) ?? id;
  const entities = model.entities.map((entity) => {
    const item = labelled(entity.name, entity.description);
    return entity.fields.length === 0 ? item : `${item}\n  Fields: ${entity.fields.join(", ")}`;
  });
  const relationships = model.relationships.map(({ from, to, kind, description }) =>
    bullet(`${nameOf(from)} → ${nameOf(to)} (${kind}): ${normalize(description)}`),
  );

  return [
    "### Entities",
    entities.join("\n"),
    "### Relationships",
    relationships.length === 0 ? "None." : relationships.join("\n"),
  ].join("\n\n");
}

function renderIntegrations(integrations: Spec["integrations"]): string {
  if (integrations.none) return noneLine(integrations.reason);
  return integrations.items.map((item) => labelled(item.name, item.purpose)).join("\n");
}

function renderAuth(auth: Spec["auth"]): string {
  return auth.none ? noneLine(auth.reason) : normalize(auth.description);
}

/**
 * Renders the approved spec as SPEC.md. Pure and deterministic: lists keep their order, and the
 * same spec always produces the same bytes. Open questions are omitted because a complete spec
 * has none.
 */
export function renderSpecMarkdown(spec: Spec): string {
  const { kind, detail } = spec.projectType;
  return document([
    SPEC_MARKER,
    `# ${oneLine(spec.name)}`,
    section("Problem", normalize(spec.problem)),
    section("Goal", normalize(spec.goal)),
    section("Target users", normalize(spec.targetUsers)),
    section("Project type", `${PROJECT_KIND_LABELS[kind]}: ${normalize(detail)}`),
    section("Core features", spec.features.map(renderFeature).join("\n\n")),
    section("Out of scope", bullets(spec.outOfScope)),
    section("Data model", renderDataModel(spec.dataModel)),
    section("Integrations", renderIntegrations(spec.integrations)),
    section("Auth", renderAuth(spec.auth)),
    section("Deployment target", normalize(spec.deploymentTarget)),
    section("Constraints and preferences", bullets(spec.constraints)),
  ]);
}
