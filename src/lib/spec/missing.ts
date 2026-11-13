import type { SpecDraft } from "@/lib/spec/schema";

// Fields every spec must answer. outOfScope, constraints and openQuestions may stay empty.
const REQUIRED_SCALARS = ["name", "problem", "goal", "targetUsers", "projectType"] as const;

function featureGaps(features: SpecDraft["features"]): string[] {
  if (!features || features.length === 0) return ["features (none yet)"];
  return features
    .filter((feature) => feature.acceptanceChecks.length === 0)
    .map((feature) => `features[${feature.id}].acceptanceChecks`);
}

function dataModelGaps(dataModel: SpecDraft["dataModel"]): string[] {
  if (!dataModel) return ["dataModel"];
  if (!dataModel.none && dataModel.entities.length === 0) return ["dataModel.entities (none yet)"];
  return [];
}

function integrationGaps(integrations: SpecDraft["integrations"]): string[] {
  if (!integrations) return ["integrations"];
  if (!integrations.none && integrations.items.length === 0) {
    return ["integrations.items (none yet)"];
  }
  return [];
}

/**
 * What still blocks the draft from being a complete spec, in template order.
 * Entries are short paths, readable by both the interview LLM and the UI.
 */
export function findMissing(draft: SpecDraft): string[] {
  const openQuestions = draft.openQuestions?.length ?? 0;
  return [
    ...REQUIRED_SCALARS.filter((field) => draft[field] === undefined),
    ...featureGaps(draft.features),
    ...dataModelGaps(draft.dataModel),
    ...integrationGaps(draft.integrations),
    ...(draft.auth ? [] : ["auth"]),
    ...(draft.deploymentTarget === undefined ? ["deploymentTarget"] : []),
    ...(openQuestions > 0 ? [`openQuestions (${String(openQuestions)} unresolved)`] : []),
  ];
}
