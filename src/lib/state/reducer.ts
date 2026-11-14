import type { CreateEvent } from "@/lib/github/events";
import type { TurnError } from "@/lib/llm/interview/client";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { isSpecComplete } from "@/lib/spec/complete";
import type { Spec, SpecDraft } from "@/lib/spec/schema";
import { topoSort, validateDag } from "@/lib/tickets/dag";
import { uncheckedTicketIds } from "@/lib/tickets/edit";
import { applyProposalOps } from "@/lib/tickets/proposal";
import type { ProposalOp, Ticket } from "@/lib/tickets/schema";
import { abandonCreation, recordProgress, startCreation } from "@/lib/state/creation";
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
  // A draft already validated by `applySpecPatch`. Editing an approved spec reopens review.
  | { type: "editDraft"; now: string; draft: SpecDraft }
  | { type: "approve"; now: string }
  | { type: "reopen"; now: string }
  // Appends the user's note and edit summary, and resumes the interview.
  | { type: "backToInterview"; now: string; text: string }
  // Tickets generated from `source`, the approved spec the request was sent with.
  | { type: "ticketsGenerated"; now: string; tickets: Ticket[]; source: Spec }
  | { type: "viewTickets"; now: string }
  // A list already validated by `saveTicket` or `deleteTicket`. The DAG may be invalid.
  | { type: "editTickets"; now: string; tickets: Ticket[] }
  // The impact ops the user accepted, for `basis`: the list the check ran on. Clears "unchecked".
  | { type: "impactApplied"; now: string; basis: Ticket[]; ops: ProposalOp[] }
  // Gated by `createBlockers`. `existing`: continue into a Keel repo the name check found.
  | { type: "createStarted"; now: string; repoName: string; existing: boolean }
  // One persisted step of the create stream (`repo`, `step`, `issue` or `complete`).
  | { type: "createProgress"; now: string; event: CreateEvent }
  // Back to the tickets, only while no repo exists yet.
  | { type: "createAbandoned"; now: string }
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
    approved: null,
    tickets: null,
    creation: null,
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

const reviewing = (project: Project): boolean =>
  project.stage === "review" || project.stage === "approved";

function editDraft(state: WorkspaceState, now: string, draft: SpecDraft): WorkspaceState {
  const project = currentProject(state.persisted);
  if (!project || !reviewing(project)) return state;
  return updateProject(state, now, () => ({ draft, stage: "review" }));
}

// Approving is gated here too, not just by the disabled button.
function approve(state: WorkspaceState, now: string): WorkspaceState {
  const project = currentProject(state.persisted);
  if (project?.stage !== "review") return state;
  const result = isSpecComplete(project.draft);
  if (!result.complete) return state;
  return updateProject(state, now, () => ({ stage: "approved", approved: result.spec }));
}

function backToInterview(state: WorkspaceState, now: string, text: string): WorkspaceState {
  const project = currentProject(state.persisted);
  if (!project || !reviewing(project)) return state;
  const next = updateProject(state, now, () => ({
    stage: "interview",
    history: [...project.history, { role: "user", content: text }],
  }));
  return withTransient(next, streaming);
}

/**
 * True when the tickets came from a spec other than the one approved last. Both specs went
 * through the same schema parse, so their keys are in the same order and JSON compares them.
 */
export function ticketsStale(project: Project): boolean {
  if (!project.tickets || !project.approved) return false;
  return JSON.stringify(project.tickets.source) !== JSON.stringify(project.approved);
}

function ticketsGenerated(
  state: WorkspaceState,
  now: string,
  tickets: Ticket[],
  source: Spec,
): WorkspaceState {
  const project = currentProject(state.persisted);
  if (project?.stage !== "approved" && project?.stage !== "tickets") return state;
  return updateProject(state, now, () => ({
    stage: "tickets",
    tickets: { items: tickets, checked: tickets, source, generatedAt: now },
  }));
}

function editTickets(state: WorkspaceState, now: string, tickets: Ticket[]): WorkspaceState {
  const project = currentProject(state.persisted);
  if (project?.stage !== "tickets" || !project.tickets) return state;
  const set = project.tickets;
  return updateProject(state, now, () => ({ tickets: { ...set, items: tickets } }));
}

/**
 * Applies accepted impact ops and marks the result checked. Gated here too, not just by the
 * review UI: refused if the tickets changed since the check ran, or if the result isn't a valid
 * list and DAG.
 */
function impactApplied(
  state: WorkspaceState,
  now: string,
  basis: Ticket[],
  ops: ProposalOp[],
): WorkspaceState {
  const project = currentProject(state.persisted);
  if (project?.stage !== "tickets" || !project.tickets) return state;
  const set = project.tickets;
  // Both lists went through the same schema parse, so JSON compares them.
  if (JSON.stringify(set.items) !== JSON.stringify(basis)) return state;
  const applied = applyProposalOps(set.items, ops);
  if (!applied.ok) return state;
  const sorted = topoSort(applied.value);
  if (!sorted.ok) return state;
  return updateProject(state, now, () => ({
    tickets: { ...set, items: sorted.value, checked: sorted.value },
  }));
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/** Why the repo can't be created yet, as readable reasons. Empty means nothing blocks it. */
export function createBlockers(project: Project): string[] {
  if (!project.tickets) return ["There are no tickets yet."];
  const { items, checked } = project.tickets;
  const dag = validateDag(items);
  const unchecked = uncheckedTicketIds(checked, items).length;
  return [
    ...(items.length === 0 ? ["Add at least one ticket."] : []),
    ...(dag.ok
      ? []
      : [`Fix ${plural(dag.error.length, "dependency problem", "dependency problems")}.`]),
    ...(unchecked > 0
      ? [`Check the impact of ${plural(unchecked, "edited ticket", "edited tickets")} on the rest.`]
      : []),
    ...(ticketsStale(project)
      ? ["The spec changed after these tickets were generated. Regenerate them."]
      : []),
  ];
}

/** Applies a creation change from `creation.ts`; a refused change leaves the state as it was. */
function changeCreation(
  state: WorkspaceState,
  now: string,
  change: (project: Project) => Partial<Project> | null,
): WorkspaceState {
  const project = currentProject(state.persisted);
  const changed = project ? change(project) : null;
  return changed ? updateProject(state, now, () => changed) : state;
}

function createStarted(
  state: WorkspaceState,
  now: string,
  repoName: string,
  existing: boolean,
): WorkspaceState {
  const project = currentProject(state.persisted);
  // Gated here too, not just by the disabled button.
  if (!project || createBlockers(project).length > 0) return state;
  return changeCreation(state, now, (p) => startCreation(p, now, repoName, existing));
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
    case "editDraft":
      return editDraft(state, action.now, action.draft);
    case "approve":
      return approve(state, action.now);
    case "reopen": {
      const stage = currentProject(state.persisted)?.stage;
      if (stage !== "approved" && stage !== "tickets") return state;
      return updateProject(state, action.now, () => ({ stage: "review" }));
    }
    case "backToInterview":
      return backToInterview(state, action.now, action.text);
    case "ticketsGenerated":
      return ticketsGenerated(state, action.now, action.tickets, action.source);
    case "viewTickets": {
      const project = currentProject(state.persisted);
      if (project?.stage !== "approved" || !project.tickets) return state;
      return updateProject(state, action.now, () => ({ stage: "tickets" }));
    }
    case "editTickets":
      return editTickets(state, action.now, action.tickets);
    case "impactApplied":
      return impactApplied(state, action.now, action.basis, action.ops);
    case "createStarted":
      return createStarted(state, action.now, action.repoName, action.existing);
    case "createProgress":
      return changeCreation(state, action.now, (p) => recordProgress(p, action.now, action.event));
    case "createAbandoned":
      return changeCreation(state, action.now, abandonCreation);
    case "reset":
      return initialWorkspace(emptyState());
  }
}
