import { err, ok, type Result } from "@/lib/result";
import {
  SpecDraftSchema,
  SpecPatchSchema,
  type DataModel,
  type Entity,
  type Feature,
  type Integration,
  type ListName,
  type OpenQuestion,
  type Relationship,
  type RemoveOp,
  type SpecDraft,
  type SpecOp,
  type UpsertOp,
} from "@/lib/spec/schema";
import { formatIssues } from "@/lib/validation";

type Item = { id: string };

/** Reads and writes one id'd list wherever it lives in the draft. */
type Lens<T extends Item> = {
  get: (draft: SpecDraft) => readonly T[];
  set: (draft: SpecDraft, items: T[]) => SpecDraft;
};

type ModelWithItems = Extract<DataModel, { none: false }>;

// Upserting into an unanswered or `none` data model or integrations section starts a list.
const modelOf = (draft: SpecDraft): ModelWithItems =>
  draft.dataModel && !draft.dataModel.none
    ? draft.dataModel
    : { none: false, entities: [], relationships: [] };

const integrationsOf = (draft: SpecDraft): Integration[] =>
  draft.integrations && !draft.integrations.none ? draft.integrations.items : [];

const lenses: { [L in ListName]: Lens<ListItems[L]> } = {
  features: {
    get: (draft) => draft.features ?? [],
    set: (draft, features) => ({ ...draft, features }),
  },
  entities: {
    get: (draft) => modelOf(draft).entities,
    set: (draft, entities) => ({ ...draft, dataModel: { ...modelOf(draft), entities } }),
  },
  relationships: {
    get: (draft) => modelOf(draft).relationships,
    set: (draft, relationships) => ({ ...draft, dataModel: { ...modelOf(draft), relationships } }),
  },
  integrations: {
    get: integrationsOf,
    set: (draft, items) => ({ ...draft, integrations: { none: false, items } }),
  },
  openQuestions: {
    get: (draft) => draft.openQuestions ?? [],
    set: (draft, openQuestions) => ({ ...draft, openQuestions }),
  },
};

type ListItems = {
  features: Feature;
  entities: Entity;
  relationships: Relationship;
  integrations: Integration;
  openQuestions: OpenQuestion;
};

function upsertWith<T extends Item>(lens: Lens<T>, draft: SpecDraft, item: T): SpecDraft {
  const items = lens.get(draft);
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return lens.set(draft, [...items, item]);
  return lens.set(draft, items.with(index, item));
}

function removeWith<T extends Item>(
  lens: Lens<T>,
  draft: SpecDraft,
  op: RemoveOp,
): Result<SpecDraft, string> {
  const items = lens.get(draft);
  if (!items.some((item) => item.id === op.id)) {
    return err(`no ${op.list} item with id ${op.id}`);
  }
  return ok(
    lens.set(
      draft,
      items.filter((item) => item.id !== op.id),
    ),
  );
}

function upsert(draft: SpecDraft, op: UpsertOp): SpecDraft {
  switch (op.list) {
    case "features":
      return upsertWith(lenses.features, draft, op.item);
    case "entities":
      return upsertWith(lenses.entities, draft, op.item);
    case "relationships":
      return upsertWith(lenses.relationships, draft, op.item);
    case "integrations":
      return upsertWith(lenses.integrations, draft, op.item);
    case "openQuestions":
      return upsertWith(lenses.openQuestions, draft, op.item);
  }
}

function remove(draft: SpecDraft, op: RemoveOp): Result<SpecDraft, string> {
  switch (op.list) {
    case "features":
      return removeWith(lenses.features, draft, op);
    case "entities":
      return removeWith(lenses.entities, draft, op);
    case "relationships":
      return removeWith(lenses.relationships, draft, op);
    case "integrations":
      return removeWith(lenses.integrations, draft, op);
    case "openQuestions":
      return removeWith(lenses.openQuestions, draft, op);
  }
}

function applyOp(draft: SpecDraft, op: SpecOp): Result<SpecDraft, string> {
  switch (op.op) {
    case "set":
      return ok({ ...draft, [op.field]: op.value });
    case "upsert":
      return ok(upsert(draft, op));
    case "remove":
      return remove(draft, op);
  }
}

/**
 * Applies an untrusted patch (an LLM tool input or a UI edit) to a draft. Ops run in order and
 * all-or-nothing: on any error the draft is unchanged and every error is returned. The result is
 * re-validated as a whole, so cross-item rules (unique ids, known entities) hold after the patch.
 */
export function applySpecPatch(draft: SpecDraft, patch: unknown): Result<SpecDraft, string[]> {
  const parsed = SpecPatchSchema.safeParse(patch);
  if (!parsed.success) return err(formatIssues(parsed.error.issues, "ops"));

  let next = draft;
  for (const [index, op] of parsed.data.entries()) {
    const result = applyOp(next, op);
    if (!result.ok) return err([`ops.${String(index)} ${result.error}`]);
    next = result.value;
  }

  const validated = SpecDraftSchema.safeParse(next);
  if (!validated.success) return err(formatIssues(validated.error.issues));
  return ok(validated.data);
}
