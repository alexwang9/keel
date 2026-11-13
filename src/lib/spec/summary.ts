import type { SpecDraft } from "@/lib/spec/schema";

/**
 * `incomplete`: answered but still blocking completion (a feature without acceptance checks).
 * `optional`: unanswered, and the spec can be complete without it.
 */
export type FieldStatus = "filled" | "incomplete" | "missing" | "optional";

export interface FieldSummary {
  key: Exclude<keyof SpecDraft, "openQuestions">;
  label: string;
  status: FieldStatus;
  preview: string;
}

const PREVIEW_CHARS = 140;

const clip = (text: string): string =>
  text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS - 1).trimEnd()}…`;

const names = (items: readonly { name: string }[]): string => items.map((i) => i.name).join(", ");

const text = (key: FieldSummary["key"], label: string, value: string | undefined): FieldSummary =>
  value === undefined
    ? { key, label, status: "missing", preview: "" }
    : { key, label, status: "filled", preview: clip(value) };

const optionalList = (
  key: "outOfScope" | "constraints",
  label: string,
  value: string[] | undefined,
): FieldSummary => {
  if (value === undefined) return { key, label, status: "optional", preview: "" };
  return { key, label, status: "filled", preview: value.length ? clip(value.join("; ")) : "None" };
};

function features(draft: SpecDraft): FieldSummary {
  const base = { key: "features", label: "Features" } as const;
  const list = draft.features ?? [];
  if (list.length === 0) return { ...base, status: "missing", preview: "" };
  const unchecked = list.filter((f) => f.acceptanceChecks.length === 0).map((f) => f.title);
  const preview = clip(list.map((f) => f.title).join(", "));
  if (unchecked.length === 0) return { ...base, status: "filled", preview };
  return {
    ...base,
    status: "incomplete",
    preview: clip(`Needs acceptance checks: ${unchecked.join(", ")}`),
  };
}

function dataModel(draft: SpecDraft): FieldSummary {
  const base = { key: "dataModel", label: "Data model" } as const;
  const model = draft.dataModel;
  if (!model) return { ...base, status: "missing", preview: "" };
  if (model.none) return { ...base, status: "filled", preview: clip(`None: ${model.reason}`) };
  if (model.entities.length === 0)
    return { ...base, status: "incomplete", preview: "No entities yet" };
  return { ...base, status: "filled", preview: clip(names(model.entities)) };
}

function integrations(draft: SpecDraft): FieldSummary {
  const base = { key: "integrations", label: "Integrations" } as const;
  const value = draft.integrations;
  if (!value) return { ...base, status: "missing", preview: "" };
  if (value.none) return { ...base, status: "filled", preview: clip(`None: ${value.reason}`) };
  if (value.items.length === 0)
    return { ...base, status: "incomplete", preview: "None listed yet" };
  return { ...base, status: "filled", preview: clip(names(value.items)) };
}

function auth(draft: SpecDraft): FieldSummary {
  const base = { key: "auth", label: "Auth" } as const;
  const value = draft.auth;
  if (!value) return { ...base, status: "missing", preview: "" };
  const preview = value.none ? `None: ${value.reason}` : value.description;
  return { ...base, status: "filled", preview: clip(preview) };
}

/** One row per template field, in template order, for the live spec panel. */
export function summarizeDraft(draft: SpecDraft): FieldSummary[] {
  const projectType = draft.projectType;
  return [
    text("name", "Name", draft.name),
    text("problem", "Problem", draft.problem),
    text("goal", "Goal", draft.goal),
    text("targetUsers", "Target users", draft.targetUsers),
    text(
      "projectType",
      "Project type",
      projectType && `${projectType.kind}: ${projectType.detail}`,
    ),
    features(draft),
    optionalList("outOfScope", "Out of scope", draft.outOfScope),
    dataModel(draft),
    integrations(draft),
    auth(draft),
    text("deploymentTarget", "Deployment", draft.deploymentTarget),
    optionalList("constraints", "Constraints", draft.constraints),
  ];
}
