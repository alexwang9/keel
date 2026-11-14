"use client";

import { DependencyGraph } from "@/components/graph/DependencyGraph";
import { GraphWarnings } from "@/components/graph/GraphWarnings";
import { useRepoGraph } from "@/components/graph/useRepoGraph";
import { ErrorNotice } from "@/components/ErrorNotice";
import { formatRepoRef, type RepoRef } from "@/lib/github/repo-ref";

interface RepoGraphViewProps {
  repo: RepoRef;
  // Links to the repo and its issues; off where the page already shows them.
  links?: boolean;
}

const linkClass = "font-medium underline";

function RepoLinks({ fullName, htmlUrl }: { fullName: string; htmlUrl: string }) {
  return (
    <p className="text-sm">
      <a href={htmlUrl} className={linkClass}>
        Open {fullName}
      </a>
      {" · "}
      <a href={`${htmlUrl}/issues`} className={linkClass}>
        View the issues
      </a>
    </p>
  );
}

/** A repo's dependency graph, loaded from GitHub, with its loading, error and empty states. */
export function RepoGraphView({ repo, links = true }: RepoGraphViewProps) {
  const { state, retry } = useRepoGraph(repo);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading the dependency graph for {formatRepoRef(repo)}…
      </p>
    );
  }
  if (state.status === "error") return <ErrorNotice error={state.error} onRetry={retry} />;

  const { graph } = state;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {links && <RepoLinks {...graph.repo} />}
      <GraphWarnings warnings={graph.warnings} />
      {graph.nodes.length === 0 ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          No Keel issues in {graph.repo.fullName} yet, so there&apos;s no graph to draw.
        </p>
      ) : (
        <div className="flex min-h-[28rem] flex-1 flex-col">
          <DependencyGraph graph={graph} />
        </div>
      )}
    </div>
  );
}
