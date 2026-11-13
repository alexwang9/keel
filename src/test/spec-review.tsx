import { useState } from "react";
import { vi } from "vitest";
import { SpecReview } from "@/components/review/SpecReview";
import { ok } from "@/lib/result";
import { applySpecPatch } from "@/lib/spec/patch";
import { SpecSchema, type SpecDraft, type SpecOp } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const spec = SpecSchema.parse(completeDraft);

interface HarnessProps {
  initial?: SpecDraft;
  onApprove?: () => void;
}

/** SpecReview with a real draft behind it, so saved edits show up like they do in the app. */
export function ReviewHarness({ initial = completeDraft, onApprove = vi.fn() }: HarnessProps) {
  const [draft, setDraft] = useState(initial);
  const onSave = (ops: SpecOp[]) => {
    const result = applySpecPatch(draft, ops);
    if (!result.ok) return result;
    setDraft(result.value);
    return ok(undefined);
  };
  return (
    <SpecReview
      draft={draft}
      baseline={spec}
      onSave={onSave}
      onApprove={onApprove}
      onBackToInterview={() => ok(undefined)}
    />
  );
}
