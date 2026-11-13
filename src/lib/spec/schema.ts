import { z } from "zod";
import { findMissing } from "@/lib/spec/missing";
import { boundedText, prefixedId, reportDuplicates } from "@/lib/validation";

export const LIMITS = {
  shortText: 200,
  longText: 4000,
  listItems: 50,
  acceptanceChecks: 20,
  transcriptText: 20_000,
  transcriptTurns: 400,
} as const;

const shortText = boundedText(LIMITS.shortText);
const longText = boundedText(LIMITS.longText);
const textList = (max: number) =>
  z.array(longText).max(max, `must have at most ${String(max)} items`);

/** Id prefix per list. Ids are assigned by the caller (LLM or UI) with `nextId`. */
export const ID_PREFIX = {
  features: "F",
  entities: "E",
  relationships: "R",
  integrations: "I",
  openQuestions: "Q",
} as const;

export type ListName = keyof typeof ID_PREFIX;

const idOf = prefixedId;

const idList = <T extends z.ZodType<{ id: string }>>(item: T) =>
  z
    .array(item)
    .max(LIMITS.listItems, `must have at most ${String(LIMITS.listItems)} items`)
    .superRefine((items, ctx) => {
      reportDuplicates(
        items.map((entry) => entry.id),
        ctx,
        (id, index) => ({ path: [index, "id"], message: `duplicates id ${id}` }),
      );
    });

export const FeatureSchema = z.object({
  id: idOf(ID_PREFIX.features),
  title: shortText,
  description: longText,
  acceptanceChecks: textList(LIMITS.acceptanceChecks),
});

export const EntitySchema = z.object({
  id: idOf(ID_PREFIX.entities),
  name: shortText,
  description: longText,
  fields: z.array(shortText).max(LIMITS.listItems),
});

export const RelationshipSchema = z.object({
  id: idOf(ID_PREFIX.relationships),
  from: idOf(ID_PREFIX.entities),
  to: idOf(ID_PREFIX.entities),
  kind: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
  description: longText,
});

export const IntegrationSchema = z.object({
  id: idOf(ID_PREFIX.integrations),
  name: shortText,
  purpose: longText,
});

export const OpenQuestionSchema = z.object({
  id: idOf(ID_PREFIX.openQuestions),
  question: longText,
});

export const PROJECT_KINDS = [
  "web-app",
  "mobile-app",
  "cli",
  "library",
  "api-service",
  "desktop-app",
  "other",
] as const;

export const ProjectTypeSchema = z.object({
  kind: z.enum(PROJECT_KINDS),
  detail: longText,
});

const none = z.object({ none: z.literal(true), reason: longText });

export const DataModelSchema = z.discriminatedUnion("none", [
  none,
  z
    .object({
      none: z.literal(false),
      entities: idList(EntitySchema),
      relationships: idList(RelationshipSchema),
    })
    .superRefine((model, ctx) => {
      const known = new Set(model.entities.map((entity) => entity.id));
      model.relationships.forEach((relationship, index) => {
        for (const end of ["from", "to"] as const) {
          if (known.has(relationship[end])) continue;
          ctx.addIssue({
            code: "custom",
            path: ["relationships", index, end],
            message: `refers to unknown entity ${relationship[end]}`,
          });
        }
      });
    }),
]);

export const IntegrationsSchema = z.discriminatedUnion("none", [
  none,
  z.object({ none: z.literal(false), items: idList(IntegrationSchema) }),
]);

export const AuthSchema = z.discriminatedUnion("none", [
  none,
  z.object({ none: z.literal(false), description: longText }),
]);

const specShape = {
  name: shortText,
  problem: longText,
  goal: longText,
  targetUsers: longText,
  projectType: ProjectTypeSchema,
  features: idList(FeatureSchema),
  outOfScope: textList(LIMITS.listItems),
  dataModel: DataModelSchema,
  integrations: IntegrationsSchema,
  auth: AuthSchema,
  deploymentTarget: longText,
  constraints: textList(LIMITS.listItems),
  openQuestions: idList(OpenQuestionSchema),
};

/** Mid-interview state: every field may still be unanswered. */
export const SpecDraftSchema = z.object(specShape).partial();

/**
 * A complete spec: every field answered and the completeness rules hold. Branded so code that
 * renders or commits a spec can only receive one that went through this schema.
 */
export const SpecSchema = z
  .object(specShape)
  .superRefine((spec, ctx) => {
    for (const gap of findMissing(spec))
      ctx.addIssue({ code: "custom", message: `missing ${gap}` });
  })
  .brand<"Spec">();

const setOp = <F extends keyof typeof specShape>(field: F) =>
  z.object({ op: z.literal("set"), field: z.literal(field), value: specShape[field] });

const upsertOp = <L extends ListName, T extends z.ZodType>(list: L, item: T) =>
  z.object({ op: z.literal("upsert"), list: z.literal(list), item });

const removeOp = <L extends ListName>(list: L) =>
  z.object({ op: z.literal("remove"), list: z.literal(list), id: idOf(ID_PREFIX[list]) });

/** Replaces a whole field. List fields with ids change only through upsert and remove. */
export const SetOpSchema = z.discriminatedUnion("field", [
  setOp("name"),
  setOp("problem"),
  setOp("goal"),
  setOp("targetUsers"),
  setOp("projectType"),
  setOp("outOfScope"),
  setOp("dataModel"),
  setOp("integrations"),
  setOp("auth"),
  setOp("deploymentTarget"),
  setOp("constraints"),
]);

/** Replaces the item with the same id in place, or appends it. */
export const UpsertOpSchema = z.discriminatedUnion("list", [
  upsertOp("features", FeatureSchema),
  upsertOp("entities", EntitySchema),
  upsertOp("relationships", RelationshipSchema),
  upsertOp("integrations", IntegrationSchema),
  upsertOp("openQuestions", OpenQuestionSchema),
]);

export const RemoveOpSchema = z.discriminatedUnion("list", [
  removeOp("features"),
  removeOp("entities"),
  removeOp("relationships"),
  removeOp("integrations"),
  removeOp("openQuestions"),
]);

export const SpecOpSchema = z.discriminatedUnion("op", [
  SetOpSchema,
  UpsertOpSchema,
  RemoveOpSchema,
]);

/** An ordered list of ops, applied atomically by `applySpecPatch`. */
export const SpecPatchSchema = z
  .array(SpecOpSchema)
  .min(1, "must contain at least one op")
  .max(LIMITS.listItems, `must have at most ${String(LIMITS.listItems)} ops`);

/** The visible text of one interview turn. Tool calls and thinking are not part of it. */
export const TranscriptMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(LIMITS.transcriptText),
});

export const TranscriptSchema = z.array(TranscriptMessageSchema).max(LIMITS.transcriptTurns);

export type Feature = z.infer<typeof FeatureSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Integration = z.infer<typeof IntegrationSchema>;
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;
export type ProjectType = z.infer<typeof ProjectTypeSchema>;
export type DataModel = z.infer<typeof DataModelSchema>;
export type SpecDraft = z.infer<typeof SpecDraftSchema>;
export type Spec = z.infer<typeof SpecSchema>;
export type SpecOp = z.infer<typeof SpecOpSchema>;
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
export type UpsertOp = z.infer<typeof UpsertOpSchema>;
export type RemoveOp = z.infer<typeof RemoveOpSchema>;
