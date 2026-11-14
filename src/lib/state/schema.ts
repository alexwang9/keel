import { z } from "zod";
import { RepoRefSchema } from "@/lib/github/events";
import { RepoNameSchema } from "@/lib/github/repo-name";
import { HistoryMessageSchema, HISTORY_LIMITS } from "@/lib/llm/interview/history";
import { SpecDraftSchema, SpecSchema } from "@/lib/spec/schema";
import { TicketListSchema, TicketSchema } from "@/lib/tickets/schema";

/** The localStorage key. The version in the key and in the object move together. */
export const STORAGE_KEY = "keel:project:v1";
export const STATE_VERSION = 1;

/** Where a project is in the flow. `creating` holds from the first create request until done. */
export const STAGES = [
  "interview",
  "review",
  "approved",
  "tickets",
  "creating",
  "created",
] as const;

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

/**
 * The creation log, saved after every step so a refresh or failure can resume. GitHub stays the
 * source of truth: a resumed run reconciles against the repo, and this log is what the UI shows.
 */
export const CreationSchema = z.object({
  repoName: RepoNameSchema,
  // True when the user chose to continue into an existing Keel repo the name check found.
  existing: z.boolean(),
  // Set once the repo exists; from then on every request resumes into it.
  repo: RepoRefSchema.nullable(),
  committed: z.boolean(),
  labelled: z.boolean(),
  // Ticket id → issue number.
  issues: z.record(TicketSchema.shape.id, z.int().positive()),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

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
  // Defaulted so states saved before Phase 10 still load.
  creation: CreationSchema.nullable().default(null),
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
export type Creation = z.infer<typeof CreationSchema>;
export type PersistedState = z.infer<typeof PersistedStateSchema>;

export const emptyState = (): PersistedState => ({
  version: STATE_VERSION,
  currentProjectId: null,
  projects: {},
});
