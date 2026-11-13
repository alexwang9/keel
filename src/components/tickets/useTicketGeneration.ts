"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialProgress,
  nextProgress,
  type GenerationProgress,
} from "@/components/tickets/progress";
import { generateTickets, type GenerationError } from "@/lib/llm/tickets/client";
import type { Spec } from "@/lib/spec/schema";
import type { Ticket } from "@/lib/tickets/schema";

export type GenerationState =
  | { status: "idle" }
  | { status: "running"; progress: GenerationProgress }
  | { status: "error"; error: GenerationError };

export interface TicketGeneration {
  state: GenerationState;
  start: (spec: Spec) => void;
}

/**
 * Runs ticket generation for a spec, tracking progress for display. Progress and errors are
 * never saved; `onGenerated` receives the tickets with the spec they came from. Unmounting
 * aborts a run in progress.
 */
export function useTicketGeneration(
  onGenerated: (tickets: Ticket[], source: Spec) => void,
): TicketGeneration {
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (spec: Spec, signal: AbortSignal) => {
      let progress = initialProgress;
      for await (const event of generateTickets(spec, signal)) {
        if (event.type === "complete") {
          setState({ status: "idle" });
          onGenerated(event.tickets, spec);
          return;
        }
        if (event.type === "error") {
          setState({ status: "error", error: event.error });
          return;
        }
        progress = nextProgress(progress, event);
        setState({ status: "running", progress });
      }
      // Ended without an outcome: only when aborted, and then nobody is watching.
    },
    [onGenerated],
  );

  const start = useCallback(
    (spec: Spec) => {
      // One run at a time; a second click while one runs is ignored.
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "running", progress: initialProgress });
      void run(spec, controller.signal).finally(() => {
        runningRef.current = false;
      });
    },
    [run],
  );

  return { state, start };
}
