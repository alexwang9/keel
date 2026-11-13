"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { sendTurn, type TurnEvent } from "@/lib/llm/interview/client";
import { HISTORY_LIMITS } from "@/lib/llm/interview/history";
import { err, ok, type Result } from "@/lib/result";
import { describeSpecEdits, editMessage } from "@/lib/spec/edits";
import { applySpecPatch } from "@/lib/spec/patch";
import type { Spec, SpecOp } from "@/lib/spec/schema";
import {
  currentProject,
  initialWorkspace,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/lib/state/reducer";
import type { PersistedState, Project } from "@/lib/state/schema";
import { saveState, type SaveProblem } from "@/lib/state/storage";
import type { Ticket } from "@/lib/tickets/schema";

export interface Workspace {
  state: WorkspaceState;
  project: Project | null;
  saveProblem: SaveProblem | null;
  send: (text: string) => void;
  retry: () => void;
  reset: () => void;
  // Applies a form edit to the draft; errors leave it unchanged.
  editSpec: (ops: SpecOp[]) => Result<void, string[]>;
  approve: () => void;
  reopen: () => void;
  backToInterview: (note: string) => Result<void, string>;
  ticketsGenerated: (tickets: Ticket[], source: Spec) => void;
  viewTickets: () => void;
}

const now = (): string => new Date().toISOString();

function toAction(event: TurnEvent): WorkspaceAction {
  switch (event.type) {
    case "text":
      return { type: "text", text: event.text };
    case "specPatch":
      return { type: "specPatch", draft: event.draft };
    case "turn":
      return { type: "turn", now: now(), messages: event.messages };
    case "complete":
      return { type: "complete", now: now(), spec: event.spec };
    case "error":
      return { type: "error", error: event.error };
  }
}

/**
 * The interview workspace: reducer state, saved to storage after every persisted change, plus
 * the actions the UI calls. One turn runs at a time; unmounting aborts it.
 */
export function useWorkspace(
  initial: PersistedState,
  storage: Storage | null,
  initialProblem: SaveProblem | null = null,
): Workspace {
  const [state, dispatch] = useReducer(workspaceReducer, initial, initialWorkspace);
  const [saveProblem, setSaveProblem] = useState(initialProblem);
  // Every change goes through `apply`, which updates this first, so it is never behind `state`.
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Applies an action now and returns the resulting state, so a turn can send the new history.
  // Saves whenever the persisted part changed; transient updates (text deltas) skip the write.
  const apply = useCallback(
    (action: WorkspaceAction): WorkspaceState => {
      const previous = stateRef.current;
      const next = workspaceReducer(previous, action);
      stateRef.current = next;
      dispatch(action);
      if (next.persisted !== previous.persisted) {
        const saved = saveState(storage, next.persisted);
        setSaveProblem(saved.ok ? null : saved.error);
      }
      return next;
    },
    [storage],
  );

  const runTurn = useCallback(
    async (project: Project) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let settled = false;
      const input = { history: project.history, draft: project.draft };
      for await (const event of sendTurn(input, controller.signal)) {
        apply(toAction(event));
        settled = event.type === "complete" || event.type === "error";
      }
      if (!settled && !controller.signal.aborted) apply({ type: "finished" });
    },
    [apply],
  );

  const send = useCallback(
    (text: string) => {
      if (stateRef.current.transient.status === "streaming") return;
      const action: WorkspaceAction = currentProject(stateRef.current.persisted)
        ? { type: "send", now: now(), text }
        : { type: "start", id: crypto.randomUUID(), now: now(), text };
      const project = currentProject(apply(action).persisted);
      if (project) void runTurn(project);
    },
    [apply, runTurn],
  );

  const retry = useCallback(() => {
    if (stateRef.current.transient.status === "streaming") return;
    const project = currentProject(apply({ type: "retry" }).persisted);
    if (project) void runTurn(project);
  }, [apply, runTurn]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    apply({ type: "reset" });
  }, [apply]);

  const editSpec = useCallback(
    (ops: SpecOp[]): Result<void, string[]> => {
      const project = currentProject(stateRef.current.persisted);
      if (!project) return err(["there is no project to edit"]);
      const result = applySpecPatch(project.draft, ops);
      if (!result.ok) return result;
      apply({ type: "editDraft", now: now(), draft: result.value });
      return ok(undefined);
    },
    [apply],
  );

  const approve = useCallback(() => apply({ type: "approve", now: now() }), [apply]);
  const reopen = useCallback(() => apply({ type: "reopen", now: now() }), [apply]);

  const backToInterview = useCallback(
    (note: string): Result<void, string> => {
      const project = currentProject(stateRef.current.persisted);
      if (!project || stateRef.current.transient.status === "streaming") {
        return err("The interview can't be resumed right now.");
      }
      const text = editMessage(note, describeSpecEdits(project.spec ?? {}, project.draft));
      if (text === "") return err("Add a note for the interviewer, or edit the spec first.");
      if (text.length > HISTORY_LIMITS.text) {
        return err("These edits are too long to send in one message. Shorten the note.");
      }
      const next = currentProject(apply({ type: "backToInterview", now: now(), text }).persisted);
      if (next) void runTurn(next);
      return ok(undefined);
    },
    [apply, runTurn],
  );

  const ticketsGenerated = useCallback(
    (tickets: Ticket[], source: Spec) =>
      apply({ type: "ticketsGenerated", now: now(), tickets, source }),
    [apply],
  );
  const viewTickets = useCallback(() => apply({ type: "viewTickets", now: now() }), [apply]);

  return {
    state,
    project: currentProject(state.persisted),
    saveProblem,
    send,
    retry,
    reset,
    editSpec,
    approve,
    reopen,
    backToInterview,
    ticketsGenerated,
    viewTickets,
  };
}
