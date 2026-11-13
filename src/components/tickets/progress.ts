import type { GenerationEvent } from "@/lib/llm/tickets/client";

export type GenerationPhase = "starting" | "thinking" | "drafting" | "validating" | "repairing";

export interface GenerationProgress {
  phase: GenerationPhase;
  // Tickets drafted so far in the current attempt.
  count: number;
  // Problems the automatic repair is fixing; 0 on the first attempt.
  problems: number;
}

export const initialProgress: GenerationProgress = { phase: "starting", count: 0, problems: 0 };

/** Folds a progress event into the progress shown. Outcome events leave it unchanged. */
export function nextProgress(
  progress: GenerationProgress,
  event: GenerationEvent,
): GenerationProgress {
  switch (event.type) {
    case "started":
      return { ...progress, count: 0 };
    case "thinking":
      return { ...progress, phase: progress.problems > 0 ? "repairing" : "thinking" };
    case "drafting":
      return { ...progress, phase: "drafting", count: event.count };
    case "validating":
      return { ...progress, phase: "validating" };
    case "repairing":
      return { phase: "repairing", count: 0, problems: event.errors };
    case "complete":
    case "error":
      return progress;
  }
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** One line of plain copy for the current phase. */
export function progressLabel({ phase, count, problems }: GenerationProgress): string {
  switch (phase) {
    case "starting":
      return "Sending the spec…";
    case "thinking":
      return "Planning the breakdown…";
    case "drafting":
      return `Drafting tickets (${plural(count, "ticket")} so far)…`;
    case "validating":
      return "Checking dependencies…";
    case "repairing":
      return `Fixing ${plural(problems, "problem")} in the first draft…`;
  }
}
