import { z } from "zod";
import { HistoryMessageSchema, HISTORY_LIMITS } from "@/lib/llm/interview/history";
import { SpecDraftSchema, SpecSchema } from "@/lib/spec/schema";

/** The localStorage key. The version in the key and in the object move together. */
export const STORAGE_KEY = "keel:project:v1";
export const STATE_VERSION = 1;

/** Where a project is in the flow. Later phases add ticket and creation stages. */
export const STAGES = ["interview", "review", "approved"] as const;

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
export type PersistedState = z.infer<typeof PersistedStateSchema>;

export const emptyState = (): PersistedState => ({
  version: STATE_VERSION,
  currentProjectId: null,
  projects: {},
});
