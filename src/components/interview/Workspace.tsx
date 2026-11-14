"use client";

import { useState } from "react";
import { CreationScreen } from "@/components/create/CreationScreen";
import { useRepoCreation, type RepoCreation } from "@/components/create/useRepoCreation";
import { ChatPanel } from "@/components/interview/ChatPanel";
import { CorruptStatePrompt } from "@/components/interview/CorruptStatePrompt";
import { SpecPanel } from "@/components/interview/SpecPanel";
import { useWorkspace, type Workspace as WorkspaceApi } from "@/components/interview/useWorkspace";
import { ApprovedSpec, type TicketStatus } from "@/components/review/ApprovedSpec";
import { SpecReview } from "@/components/review/SpecReview";
import { TicketsScreen } from "@/components/tickets/TicketsScreen";
import { awaitingReply, createBlockers, ticketsStale } from "@/lib/state/reducer";
import { emptyState, type PersistedState, type Project } from "@/lib/state/schema";
import {
  browserStorage,
  loadState,
  saveState,
  type LoadResult,
  type SaveProblem,
} from "@/lib/state/storage";

const SAVE_COPY: Record<SaveProblem, string> = {
  quota: "This browser's storage is full, so the latest changes aren't saved.",
  unavailable: "This browser isn't letting Keel save, so a refresh will lose this interview.",
};

function SaveWarning({ problem }: { problem: SaveProblem | null }) {
  if (!problem) return null;
  return (
    <p
      role="status"
      className="bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {SAVE_COPY[problem]}
    </p>
  );
}

const ticketStatus = (project: Project): TicketStatus => {
  if (!project.tickets) return "none";
  return ticketsStale(project) ? "stale" : "current";
};

interface StageProps {
  workspace: WorkspaceApi;
  creation: RepoCreation;
}

/**
 * The screen for the project's stage: interview, spec review, the approved spec, tickets, or
 * repo creation.
 */
function Stage({ workspace, creation }: StageProps) {
  const { project, state } = workspace;
  const { transient } = state;

  if (project?.stage === "review") {
    return (
      <SpecReview
        draft={project.draft}
        baseline={project.spec}
        onSave={workspace.editSpec}
        onApprove={workspace.approve}
        onBackToInterview={workspace.backToInterview}
      />
    );
  }
  if (project?.stage === "approved" && project.approved) {
    return (
      <ApprovedSpec
        spec={project.approved}
        tickets={ticketStatus(project)}
        onEdit={workspace.reopen}
        onGenerated={workspace.ticketsGenerated}
        onViewTickets={workspace.viewTickets}
      />
    );
  }
  if (project?.stage === "tickets" && project.tickets && project.approved) {
    return (
      <TicketsScreen
        tickets={project.tickets.items}
        checked={project.tickets.checked}
        approved={project.approved}
        stale={ticketsStale(project)}
        blockers={createBlockers(project)}
        onGenerated={workspace.ticketsGenerated}
        onEditSpec={workspace.reopen}
        onSaveTicket={workspace.saveTicket}
        onDeleteTicket={workspace.deleteTicket}
        onApplyImpact={workspace.applyImpact}
        onCreate={(repoName, existing) => {
          workspace.startCreation(repoName, existing);
          creation.run();
        }}
      />
    );
  }
  if ((project?.stage === "creating" || project?.stage === "created") && project.creation) {
    return (
      <CreationScreen
        creation={project.creation}
        tickets={project.tickets?.items ?? []}
        done={project.stage === "created"}
        run={creation.state}
        onResume={creation.run}
        onChangeName={workspace.abandonCreation}
      />
    );
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_22rem]">
      <ChatPanel
        history={project?.history ?? []}
        streamingText={transient.streamingText}
        status={transient.status}
        error={transient.error}
        awaitingReply={project ? awaitingReply(project) : false}
        onSend={workspace.send}
        onRetry={workspace.retry}
      />
      <SpecPanel draft={transient.pendingDraft ?? project?.draft ?? {}} />
    </div>
  );
}

interface LoadedWorkspaceProps {
  initial: PersistedState;
  storage: Storage | null;
  problem: SaveProblem | null;
}

function LoadedWorkspace({ initial, storage, problem }: LoadedWorkspaceProps) {
  const workspace = useWorkspace(initial, storage, problem);
  const creation = useRepoCreation({
    request: workspace.creationRequest,
    record: workspace.recordCreation,
  });
  const { project } = workspace;

  const startOver = () => {
    if (window.confirm("Start over? This deletes the current interview, spec and tickets.")) {
      workspace.reset();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SaveWarning problem={workspace.saveProblem} />
      {project && (
        <div className="flex justify-end px-6 pt-3">
          <button type="button" onClick={startOver} className="text-xs text-zinc-500 underline">
            Start over
          </button>
        </div>
      )}
      <Stage workspace={workspace} creation={creation} />
    </div>
  );
}

interface Loaded {
  storage: Storage | null;
  result: LoadResult;
  // Set when resetting an unreadable state couldn't overwrite it.
  problem: SaveProblem | null;
}

function load(): Loaded {
  const storage = browserStorage();
  return { storage, result: loadState(storage), problem: null };
}

/**
 * The signed-in app. Client-only (see WorkspaceLoader), so saved state is read on first render,
 * validated, and either restored or, if unreadable, offered for export before a reset.
 */
export function Workspace() {
  const [loaded, setLoaded] = useState(load);
  const { storage, result } = loaded;

  if (result.kind === "corrupt") {
    const reset = () => {
      const state = emptyState();
      const saved = saveState(storage, state);
      setLoaded({ storage, result: { kind: "ok", state }, problem: saved.ok ? null : saved.error });
    };
    return <CorruptStatePrompt raw={result.raw} reasons={result.reasons} onReset={reset} />;
  }
  const initial = result.kind === "ok" ? result.state : emptyState();
  const problem = result.kind === "unavailable" ? "unavailable" : loaded.problem;
  return <LoadedWorkspace initial={initial} storage={storage} problem={problem} />;
}
