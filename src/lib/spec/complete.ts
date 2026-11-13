import { findMissing } from "@/lib/spec/missing";
import { SpecSchema, type Spec, type SpecDraft } from "@/lib/spec/schema";
import { formatIssues } from "@/lib/validation";

export type Completeness = { complete: true; spec: Spec } | { complete: false; missing: string[] };

/** Whether a draft is ready for approval. Unanswered optional lists become empty lists. */
export function isSpecComplete(draft: SpecDraft): Completeness {
  const missing = findMissing(draft);
  if (missing.length > 0) return { complete: false, missing };

  const parsed = SpecSchema.safeParse({
    ...draft,
    outOfScope: draft.outOfScope ?? [],
    constraints: draft.constraints ?? [],
    openQuestions: draft.openQuestions ?? [],
  });
  if (parsed.success) return { complete: true, spec: parsed.data };
  // Only reachable if the draft itself is structurally invalid (e.g. read unvalidated).
  return { complete: false, missing: formatIssues(parsed.error.issues) };
}
