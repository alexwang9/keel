import type { TurnError } from "@/lib/llm/interview/client";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import type { Spec, SpecDraft } from "@/lib/spec/schema";
import { emptyState, type PersistedState, type Project } from "@/lib/state/schema";

export type TurnStatus = "idle" | "streaming" | "error";

/** UI state that is never saved: a refresh drops it, and the stored history stays consistent. */
export interface Transient {
  status: TurnStatus;
  // Text streamed since the last committed turn.
  streamingText: string;
  // The server's draft from `specPatch`, stored once the turn carrying it commits.
  pendingDraft: SpecDraft | null;
  error: TurnError | null;
}

export interface WorkspaceState {
  persisted: PersistedState;
  transient: Transient;
}

export type WorkspaceAction =
  | { type: "start"; id: string; now: string; text: string }
  | { type: "send"; now: string; text: string }
  | { type: "retry" }
  | { type: "text"; text: string }
  | { type: "specPatch"; draft: SpecDraft }
  | { type: "turn"; now: string; messages: HistoryMessage[] }
  | { type: "complete"; now: string; spec: Spec }
  | { type: "finished" }
  | { type: "error"; error: TurnError }
  | { type: "reset" };

const idleTransient = (): Transient => ({
  status: "idle",
  streamingText: "",
  pendingDraft: null,
  error: null,
});

export const initialWorkspace = (persisted: PersistedState): WorkspaceState => ({
  persisted,
  transient: idleTransient(),
});

export function currentProject(state: PersistedState): Project | null {
  if (state.currentProjectId === null) return null;
  return state.projects[state.currentProjectId] ?? null;
}

/** True when the stored history ends waiting on the assistant, e.g. after an error or a refresh. */
export function awaitingReply(project: Project): boolean {
  return project.stage === "interview" && project.history.at(-1)?.role === "user";
}

function updateProject(
  state: WorkspaceState,
  now: string,
  change: (project: Project) => Partial<Project>,
): WorkspaceState {
  const project = currentProject(state.persisted);
  if (!project) return state;
  const next = { ...project, ...change(project), updatedAt: now };
  return {
    ...state,
    persisted: { ...state.persisted, projects: { ...state.persisted.projects, [next.id]: next } },
  };
}

const withTransient = (state: WorkspaceState, change: Partial<Transient>): WorkspaceState => ({
  ...state,
  transient: { ...state.transient, ...change },
});

const streaming = { status: "streaming", streamingText: "", error: null } as const;

function start(state: WorkspaceState, id: string, now: string, text: string): WorkspaceState {
  const project: Project = {
    id,
    createdAt: now,
    updatedAt: now,
    stage: "interview",
    history: [{ role: "user", content: text }],
    draft: {},
    spec: null,
  };
  // V0 keeps one project: starting a new one replaces whatever was stored.
  return {
    persisted: { ...state.persisted, currentProjectId: id, projects: { [id]: project } },
    transient: { ...idleTransient(), ...streaming },
  };
}

function turn(state: WorkspaceState, now: string, messages: HistoryMessage[]): WorkspaceState {
  const { pendingDraft } = state.transient;
  const next = updateProject(state, now, (project) => ({
    history: [...project.history, ...messages],
    ...(pendingDraft ? { draft: pendingDraft } : {}),
  }));
  return withTransient(next, { streamingText: "", pendingDraft: null });
}

/** Pure state transitions for the workspace. Ids and timestamps come in on the action. */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "start":
      return start(state, action.id, action.now, action.text);
    case "send": {
      const next = updateProject(state, action.now, (project) => ({
        history: [...project.history, { role: "user", content: action.text }],
      }));
      return withTransient(next, streaming);
    }
    case "retry":
      return withTransient(state, streaming);
    case "text":
      return withTransient(state, { streamingText: state.transient.streamingText + action.text });
    case "specPatch":
      return withTransient(state, { pendingDraft: action.draft });
    case "turn":
      return turn(state, action.now, action.messages);
    case "complete": {
      const next = updateProject(state, action.now, () => ({ stage: "review", spec: action.spec }));
      return withTransient(next, idleTransient());
    }
    case "finished":
      return withTransient(state, { status: "idle", streamingText: "", pendingDraft: null });
    case "error":
      // Drop everything provisional; the stored history ends where the last turn committed.
      return withTransient(state, { ...idleTransient(), status: "error", error: action.error });
    case "reset":
      return initialWorkspace(emptyState());
  }
}
