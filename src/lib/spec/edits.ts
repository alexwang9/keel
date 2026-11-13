import { bullets, normalize, oneLine } from "@/lib/markdown";
import type {
  Entity,
  Feature,
  Integration,
  ProjectType,
  Relationship,
  SpecDraft,
} from "@/lib/spec/schema";

type TextField = "name" | "problem" | "goal" | "targetUsers" | "deploymentTarget";
type TextListField = "outOfScope" | "constraints";

const TEXT_LABELS: Record<TextField, string> = {
  name: "name",
  problem: "problem",
  goal: "goal",
  targetUsers: "target users",
  deploymentTarget: "deployment target",
};

const LIST_LABELS: Record<TextListField, string> = {
  outOfScope: "out of scope",
  constraints: "constraints",
};

/** Structural equality for plain JSON values, independent of key order. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

const quoted = (text: string): string => `"${oneLine(text)}"`;

const checks = (items: readonly string[]): string =>
  items.length === 0 ? "none" : items.map((item) => oneLine(item)).join("; ");

const describeFeature = (f: Feature): string =>
  `${f.id} ${quoted(f.title)}: ${normalize(f.description)} Acceptance checks: ${checks(f.acceptanceChecks)}`;

const describeEntity = (e: Entity): string =>
  `${e.id} ${quoted(e.name)}: ${normalize(e.description)} Fields: ${checks(e.fields)}`;

const describeRelationship = (r: Relationship): string =>
  `${r.id} ${r.from} → ${r.to} (${r.kind}): ${normalize(r.description)}`;

const describeIntegration = (i: Integration): string =>
  `${i.id} ${quoted(i.name)}: ${normalize(i.purpose)}`;

const describeProjectType = (type: ProjectType): string => `${type.kind} (${oneLine(type.detail)})`;

/** Added, changed and removed items of one id'd list, in before-then-after order. */
function itemEdits<T extends { id: string }>(
  noun: string,
  before: readonly T[],
  after: readonly T[],
  describe: (item: T) => string,
): string[] {
  const old = new Map(before.map((item) => [item.id, item]));
  const kept = new Set(after.map((item) => item.id));
  const removed = before
    .filter((item) => !kept.has(item.id))
    .map((item) => `Removed ${noun} ${describe(item)}`);
  const addedOrChanged = after.flatMap((item) => {
    const previous = old.get(item.id);
    if (!previous) return [`Added ${noun} ${describe(item)}`];
    return sameValue(previous, item) ? [] : [`Changed ${noun} ${describe(item)}`];
  });
  return [...removed, ...addedOrChanged];
}

const textEdit =
  (field: TextField) =>
  (before: SpecDraft, after: SpecDraft): string[] => {
    const value = after[field];
    if (value === before[field]) return [];
    const label = TEXT_LABELS[field];
    return value === undefined ? [`Cleared the ${label}`] : [`Changed the ${label} to: ${value}`];
  };

const textListEdit =
  (field: TextListField) =>
  (before: SpecDraft, after: SpecDraft): string[] => {
    const value = after[field] ?? [];
    if (sameValue(before[field] ?? [], value)) return [];
    const label = LIST_LABELS[field];
    return value.length === 0
      ? [`Emptied ${label}`]
      : [`Changed ${label} to: ${value.map((item) => oneLine(item)).join("; ")}`];
  };

const featureEdits = (before: SpecDraft, after: SpecDraft): string[] =>
  itemEdits("feature", before.features ?? [], after.features ?? [], describeFeature);

function projectTypeEdits(before: SpecDraft, after: SpecDraft): string[] {
  const value = after.projectType;
  if (sameValue(before.projectType, value)) return [];
  return value ? [`Changed the project type to ${describeProjectType(value)}`] : [];
}

const modelItems = (draft: SpecDraft) =>
  draft.dataModel && !draft.dataModel.none ? draft.dataModel : { entities: [], relationships: [] };

function dataModelEdits(before: SpecDraft, after: SpecDraft): string[] {
  const was = before.dataModel;
  const now = after.dataModel;
  if (sameValue(was, now)) return [];
  if (now?.none) return [`Set the data model to none: ${normalize(now.reason)}`];
  const mode = was?.none ? ["The data model is no longer none"] : [];
  const from = modelItems(before);
  const to = modelItems(after);
  return [
    ...mode,
    ...itemEdits("entity", from.entities, to.entities, describeEntity),
    ...itemEdits("relationship", from.relationships, to.relationships, describeRelationship),
  ];
}

const integrationItems = (draft: SpecDraft): Integration[] =>
  draft.integrations && !draft.integrations.none ? draft.integrations.items : [];

function integrationEdits(before: SpecDraft, after: SpecDraft): string[] {
  const was = before.integrations;
  const now = after.integrations;
  if (sameValue(was, now)) return [];
  if (now?.none) return [`Set integrations to none: ${normalize(now.reason)}`];
  const mode = was?.none ? ["Integrations are no longer none"] : [];
  return [
    ...mode,
    ...itemEdits(
      "integration",
      integrationItems(before),
      integrationItems(after),
      describeIntegration,
    ),
  ];
}

function authEdits(before: SpecDraft, after: SpecDraft): string[] {
  const now = after.auth;
  if (!now || sameValue(before.auth, now)) return [];
  return now.none
    ? [`Set auth to none: ${normalize(now.reason)}`]
    : [`Changed auth to: ${normalize(now.description)}`];
}

// Template order, matching SPEC.md.
const SECTIONS: ((before: SpecDraft, after: SpecDraft) => string[])[] = [
  textEdit("name"),
  textEdit("problem"),
  textEdit("goal"),
  textEdit("targetUsers"),
  projectTypeEdits,
  featureEdits,
  textListEdit("outOfScope"),
  dataModelEdits,
  integrationEdits,
  authEdits,
  textEdit("deploymentTarget"),
  textListEdit("constraints"),
];

/**
 * Plain-English lines describing how `after` differs from `before`, in template order. Each line
 * carries the full new value, because the interview model never sees the draft itself.
 */
export function describeSpecEdits(before: SpecDraft, after: SpecDraft): string[] {
  return SECTIONS.flatMap((section) => section(before, after));
}

/**
 * The user message "Back to interview" appends: the user's note, then the edits. Either may be
 * empty, but not both.
 */
export function editMessage(note: string, edits: readonly string[]): string {
  const parts = [normalize(note)].filter((part) => part !== "");
  if (edits.length > 0) {
    parts.push(
      `I edited the spec in the form. These changes are already applied:\n${bullets(edits)}`,
    );
  }
  return parts.join("\n\n");
}
