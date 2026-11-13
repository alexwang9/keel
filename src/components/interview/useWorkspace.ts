"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { sendTurn, type TurnEvent } from "@/lib/llm/interview/client";
import {
  currentProject,
  initialWorkspace,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/lib/state/reducer";
import type { PersistedState, Project } from "@/lib/state/schema";
import { saveState, type SaveProblem } from "@/lib/state/storage";

export interface Workspace {
  state: WorkspaceState;
  project: Project | null;
  saveProblem: SaveProblem | null;
  send: (text: string) => void;
  retry: () => void;
  reset: () => void;
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

  return { state, project: currentProject(state.persisted), saveProblem, send, retry, reset };
}
