import type { Stage } from "@/lib/state/schema";

export const STEPS = ["Interview", "Spec", "Tickets", "Repo", "Graph"] as const;
export type Step = (typeof STEPS)[number];

const STEP_FOR_STAGE: Record<Stage, Step> = {
  interview: "Interview",
  review: "Spec",
  approved: "Spec",
  tickets: "Tickets",
  creating: "Repo",
  created: "Graph",
};

/** The step a project is on. No project yet means the interview is about to start. */
export const stepFor = (stage: Stage | undefined): Step => STEP_FOR_STAGE[stage ?? "interview"];

/**
 * Where the project is in Keel's flow. Display only: moving between stages goes through each
 * screen's own actions, which hold the rules (approve, the create gate, the creation lock).
 */
export function StageSteps({ stage }: { stage: Stage | undefined }) {
  const current = STEPS.indexOf(stepFor(stage));
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {STEPS.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "todo";
          return (
            <li key={step} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden className="h-px w-4 bg-zinc-300 dark:bg-zinc-700" />}
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={`flex items-center gap-1.5 ${STEP_TEXT[state]}`}
              >
                <span
                  aria-hidden
                  className={`flex size-5 items-center justify-center rounded-full text-[0.7rem] font-semibold ${STEP_DOT[state]}`}
                >
                  {state === "done" ? "✓" : index + 1}
                </span>
                {step}
                {state === "done" && <span className="sr-only">(done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const STEP_TEXT = {
  done: "text-zinc-600 dark:text-zinc-400",
  current: "font-semibold text-zinc-950 dark:text-zinc-50",
  todo: "text-zinc-400 dark:text-zinc-600",
} as const;

const STEP_DOT = {
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  current: "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950",
  todo: "border border-zinc-300 dark:border-zinc-700",
} as const;
