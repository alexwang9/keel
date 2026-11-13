import type { z } from "zod";
import { SpecSchema } from "@/lib/spec/schema";
import {
  PersistedStateSchema,
  STORAGE_KEY,
  type Project,
  type ProjectSchema,
} from "@/lib/state/schema";
import { completeDraft } from "@/test/fixtures/spec";

export const PROJECT_ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";
export const T0 = "2026-11-12T10:00:00.000Z";
export const spec = SpecSchema.parse(completeDraft);

/**
 * Saves an approved project to localStorage, with `extra` overriding fields. Takes the stored
 * shape, before parsing fills defaults such as `tickets.checked`.
 */
export function storeProject(extra: Partial<z.input<typeof ProjectSchema>>): void {
  const project = {
    id: PROJECT_ID,
    createdAt: T0,
    updatedAt: T0,
    stage: "approved",
    history: [{ role: "user", content: "hi" }],
    draft: completeDraft,
    spec,
    approved: spec,
    tickets: null,
    ...extra,
  };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      currentProjectId: PROJECT_ID,
      projects: { [PROJECT_ID]: project },
    }),
  );
}

/** The project as saved now, parsed. */
export function storedProject(): Project | undefined {
  const raw = localStorage.getItem(STORAGE_KEY) ?? "null";
  return Object.values(PersistedStateSchema.parse(JSON.parse(raw)).projects)[0];
}
