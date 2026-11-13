import { renderSpecMarkdown } from "@/lib/spec/render";
import type { Spec } from "@/lib/spec/schema";

interface SpecReviewProps {
  spec: Spec;
}

/** Placeholder review screen: shows the SPEC.md that would be committed. Phase 6 adds editing. */
export function SpecReview({ spec }: SpecReviewProps) {
  return (
    <section aria-label="Spec review" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Review your spec</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        The interview is complete. Editing and approval arrive next.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-zinc-100 p-4 text-sm whitespace-pre-wrap dark:bg-zinc-900">
        {renderSpecMarkdown(spec)}
      </pre>
    </section>
  );
}
