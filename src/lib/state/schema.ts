import { z } from "zod";
import { HistoryMessageSchema, HISTORY_LIMITS } from "@/lib/llm/interview/history";
import { SpecDraftSchema, SpecSchema } from "@/lib/spec/schema";
import { TicketListSchema } from "@/lib/tickets/schema";

/** The localStorage key. The version in the key and in the object move together. */
export const STORAGE_KEY = "keel:project:v1";
export const STATE_VERSION = 1;

/** Where a project is in the flow. Later phases add creation stages. */
export const STAGES = ["interview", "review", "approved", "tickets"] as const;

/**
 * Generated tickets, with the approved spec they came from so staleness can be worked out.
 * `checked` is the list as of the last impact check (or generation); `items` differing from it
 * means there are unchecked edits.
 */
export const TicketSetSchema = z
  .object({
    items: TicketListSchema,
    // Optional so states saved before Phase 8 still load: nothing has been edited yet.
    checked: TicketListSchema.optional(),
    source: SpecSchema,
    generatedAt: z.iso.datetime(),
  })
  .transform(({ checked, ...set }) => ({ ...set, checked: checked ?? set.items }));

export const ProjectSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  stage: z.enum(STAGES),
  // Committed turns only: never ends partway through a model response.
  history: z.array(HistoryMessageSchema).max(HISTORY_LIMITS.messages),
  // The working copy: the interview fills it, and the review form edits it.
  draft: SpecDraftSchema,
  // The spec as of the last completed interview: what the model last saw. "Back to interview"
  // describes the draft's changes against it.
  spec: SpecSchema.nullable(),
  // The spec as of the last Approve. Kept when an edit reopens review, so tickets generated from
  // it can tell they are stale. Defaulted so states saved before Phase 6 still load.
  approved: SpecSchema.nullable().default(null),
  // Defaulted so states saved before Phase 7 still load.
  tickets: TicketSetSchema.nullable().default(null),
});

/**
 * Everything Keel keeps in the browser before a repo exists. Keyed by project id so several
 * projects can be added later; V0 keeps one.
 */
export const PersistedStateSchema = z
  .object({
    version: z.literal(STATE_VERSION),
    currentProjectId: z.uuid().nullable(),
    projects: z.record(z.uuid(), ProjectSchema),
  })
  .refine((state) => state.currentProjectId === null || state.currentProjectId in state.projects, {
    message: "currentProjectId must name a stored project",
    path: ["currentProjectId"],
  })
  .refine((state) => Object.entries(state.projects).every(([key, p]) => key === p.id), {
    message: "each project must be stored under its own id",
    path: ["projects"],
  });

export type Stage = (typeof STAGES)[number];
export type Project = z.infer<typeof ProjectSchema>;
export type TicketSet = z.infer<typeof TicketSetSchema>;
export type PersistedState = z.infer<typeof PersistedStateSchema>;

export const emptyState = (): PersistedState => ({
  version: STATE_VERSION,
  currentProjectId: null,
  projects: {},
});
