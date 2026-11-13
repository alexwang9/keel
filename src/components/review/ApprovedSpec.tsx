import { buttonClass } from "@/components/review/inputs";
import { SpecMarkdown } from "@/components/review/SpecReview";
import type { Spec } from "@/lib/spec/schema";

interface ApprovedSpecProps {
  spec: Spec;
  onEdit: () => void;
}

/** Shown after approval. Phase 7 replaces the placeholder copy with ticket generation. */
export function ApprovedSpec({ spec, onEdit }: ApprovedSpecProps) {
  return (
    <section
      aria-label="Approved spec"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">Spec approved</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Ticket generation arrives next. Editing the spec reopens review, and it will need approving
        again.
      </p>
      <div>
        <button type="button" onClick={onEdit} className={buttonClass}>
          Edit spec
        </button>
      </div>
      <SpecMarkdown spec={spec} />
    </section>
  );
}
