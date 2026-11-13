"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkImpact, type ImpactCheckError, type ImpactInput } from "@/lib/llm/impact/client";
import type { ProposalOp, Ticket } from "@/lib/tickets/schema";

export type ImpactPhase = "starting" | "thinking" | "validating" | "repairing";

export type ImpactState =
  | { status: "idle" }
  // `problems`: what the automatic repair is fixing; 0 on the first attempt.
  | { status: "running"; phase: ImpactPhase; problems: number }
  | { status: "error"; error: ImpactCheckError }
  // `basis` is the ticket list the proposal was made for.
  | { status: "reviewing"; basis: Ticket[]; ops: ProposalOp[] };

export interface ImpactCheck {
  state: ImpactState;
  start: (input: ImpactInput) => void;
  // Closes the proposal or error, back to idle.
  close: () => void;
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** One line of plain copy for a running check. */
export function impactLabel(phase: ImpactPhase, problems: number): string {
  switch (phase) {
    case "starting":
      return "Sending your edits…";
    case "thinking":
      return "Weighing your edits against the other tickets…";
    case "validating":
      return "Checking the proposed changes…";
    case "repairing":
      return `Fixing ${plural(problems, "problem")} in the proposal…`;
  }
}

/**
 * Runs an impact check and holds the proposal for review. Nothing here is saved: a refresh
 * drops the proposal, and the edits stay unchecked. Unmounting aborts a check in progress.
 */
export function useImpactCheck(): ImpactCheck {
  const [state, setState] = useState<ImpactState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (input: ImpactInput, signal: AbortSignal) => {
    let problems = 0;
    for await (const event of checkImpact(input, signal)) {
      switch (event.type) {
        case "complete":
          setState({ status: "reviewing", basis: [...input.tickets], ops: event.ops });
          return;
        case "error":
          setState({ status: "error", error: event.error });
          return;
        case "repairing":
          problems = event.errors;
          setState({ status: "running", phase: "repairing", problems });
          break;
        case "thinking":
        case "validating":
          // After a repair starts, keep saying so until the outcome.
          if (problems === 0) setState({ status: "running", phase: event.type, problems });
          break;
        case "started":
          break;
      }
    }
    // Ended without an outcome: only when aborted, and then nobody is watching.
  }, []);

  const start = useCallback(
    (input: ImpactInput) => {
      // One check at a time; a second click while one runs is ignored.
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "running", phase: "starting", problems: 0 });
      void run(input, controller.signal).finally(() => {
        runningRef.current = false;
      });
    },
    [run],
  );

  const close = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, start, close };
}
