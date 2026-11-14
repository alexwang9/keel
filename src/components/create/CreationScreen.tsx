"use client";

import type { ReactNode } from "react";
import type { CreationRunState } from "@/components/create/useRepoCreation";
import { ErrorNotice } from "@/components/ErrorNotice";
import { RepoGraphView } from "@/components/graph/RepoGraphView";
import { buttonClass, primaryButtonClass } from "@/components/review/inputs";
import { graphPath, parseRepoRef } from "@/lib/github/repo-ref";
import type { Creation } from "@/lib/state/schema";
import type { Ticket } from "@/lib/tickets/schema";

interface CreationScreenProps {
  creation: Creation;
  // In creation order (the saved list is topologically sorted).
  tickets: readonly Ticket[];
  done: boolean;
  run: CreationRunState;
  onResume: () => void;
  // Back to the tickets to pick another name; offered only while no repo exists.
  onChangeName: () => void;
}

const linkClass = "font-medium underline";

function Step({ done, label, children }: { done: boolean; label: string; children?: ReactNode }) {
  return (
    <li aria-label={label} className="flex items-baseline gap-2">
      <span aria-hidden className={done ? "text-emerald-600" : "text-zinc-400"}>
        {done ? "✓" : "○"}
      </span>
      <span className="flex-1">{children ?? label}</span>
      <span className="text-xs text-zinc-500">{done ? "Done" : "Waiting"}</span>
    </li>
  );
}

function IssueSteps({ creation, tickets }: Pick<CreationScreenProps, "creation" | "tickets">) {
  const { repo, issues } = creation;
  return (
    <ul className="flex flex-col gap-1 pl-6">
      {tickets.map((ticket) => {
        const number = issues[ticket.id];
        return (
          <Step key={ticket.id} done={number !== undefined} label={`${ticket.id}: ${ticket.title}`}>
            {ticket.id}: {ticket.title}
            {number !== undefined && repo && (
              <>
                {" → "}
                <a href={`${repo.htmlUrl}/issues/${String(number)}`} className={linkClass}>
                  #{number}
                </a>
              </>
            )}
          </Step>
        );
      })}
    </ul>
  );
}

function RunStatus(props: CreationScreenProps) {
  const { run, done, creation } = props;
  if (done) return null;
  if (run.status === "running") {
    return (
      <p role="status" className="text-zinc-600 dark:text-zinc-400">
        Creating on GitHub… Issues go in a few seconds apart. Keep this tab open.
      </p>
    );
  }
  const changeName = creation.repo === null && (
    <button type="button" onClick={props.onChangeName} className={buttonClass}>
      Change name
    </button>
  );
  if (run.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <ErrorNotice error={run.error} onRetry={props.onResume} retryLabel="Resume" />
        {changeName}
      </div>
    );
  }
  // Idle without being done: a refresh or a closed tab stopped it partway.
  return (
    <div role="status" className="flex flex-wrap items-center gap-2">
      <p>Creation stopped before it finished. Resume to carry on; nothing is created twice.</p>
      <button type="button" onClick={props.onResume} className={primaryButtonClass}>
        Resume
      </button>
      {changeName}
    </div>
  );
}

/** The new repo's graph, shown once creation finishes, with a link to its own page. */
function CreatedGraph({ fullName }: { fullName: string }) {
  const ref = parseRepoRef(fullName);
  if (!ref.ok) return null;
  return (
    <section aria-label="Dependencies" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Dependency graph</h2>
        <a href={graphPath(ref.value)} className={linkClass}>
          Open full page
        </a>
      </div>
      <RepoGraphView repo={ref.value} links={false} />
    </section>
  );
}

/**
 * Progress of repo creation from the saved log: the repo, the commit, the labels and each
 * issue. On failure it shows exactly what exists and offers Resume; once done, links to GitHub.
 */
export function CreationScreen(props: CreationScreenProps) {
  const { creation, tickets, done } = props;
  const { repo } = creation;
  const created = Object.keys(creation.issues).length;

  return (
    <section
      aria-label="Repo creation"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 text-sm"
    >
      <h1 className="text-xl font-semibold">{done ? "Repo created" : "Creating the repo"}</h1>
      {done && repo && (
        <p>
          <a href={repo.htmlUrl} className={linkClass}>
            Open {repo.fullName}
          </a>
          {" · "}
          <a href={`${repo.htmlUrl}/issues`} className={linkClass}>
            View the issues
          </a>
        </p>
      )}
      <RunStatus {...props} />
      <ul className="flex flex-col gap-1">
        <Step done={repo !== null} label="Repo">
          Repo{" "}
          {repo ? (
            <a href={repo.htmlUrl} className={linkClass}>
              {repo.fullName}
            </a>
          ) : (
            creation.repoName
          )}
        </Step>
        <Step done={creation.committed} label="Commit SPEC.md, docs/interview.md and README.md" />
        <Step done={creation.labelled} label="Labels" />
        <Step done={created === tickets.length} label="Issues">
          Issues ({created} of {tickets.length})
        </Step>
      </ul>
      <IssueSteps creation={creation} tickets={tickets} />
      {done && repo && <CreatedGraph fullName={repo.fullName} />}
    </section>
  );
}
