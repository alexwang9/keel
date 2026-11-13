import { ErrorNotice } from "@/components/ErrorNotice";
import { progressLabel } from "@/components/tickets/progress";
import type { GenerationState } from "@/components/tickets/useTicketGeneration";

interface GenerationStatusProps {
  state: GenerationState;
  onRetry: () => void;
}

/** Progress while tickets generate, or the error with a retry. Nothing when idle. */
export function GenerationStatus({ state, onRetry }: GenerationStatusProps) {
  if (state.status === "idle") return null;
  if (state.status === "error") return <ErrorNotice error={state.error} onRetry={onRetry} />;
  return (
    <div role="status" className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">
        {progressLabel(state.progress)}
      </p>
      <p>This usually takes a few minutes. Keep this tab open.</p>
    </div>
  );
}
