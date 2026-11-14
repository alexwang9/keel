import type { CreateEvent } from "@/lib/github/events";
import type { CreateRequest } from "@/lib/github/request";
import { toTranscript } from "@/lib/llm/interview/history";
import type { Creation, Project } from "@/lib/state/schema";

// Repo creation, as pure changes to a project. `null` means the change is refused.

/** Starts the creation log. The caller checks `createBlockers` first. */
export function startCreation(
  project: Project,
  now: string,
  repoName: string,
  existing: boolean,
): Partial<Project> | null {
  if (project.stage !== "tickets" || project.creation) return null;
  const creation: Creation = {
    repoName,
    existing,
    repo: null,
    committed: false,
    labelled: false,
    issues: {},
    startedAt: now,
    completedAt: null,
  };
  return { stage: "creating", creation };
}

/** Records one step from the create stream. `paused` and `error` aren't saved. */
export function recordProgress(
  project: Project,
  now: string,
  event: CreateEvent,
): Partial<Project> | null {
  const { creation } = project;
  if (project.stage !== "creating" || !creation) return null;
  switch (event.type) {
    case "repo":
      return { creation: { ...creation, repo: event.repo } };
    case "step":
      return {
        creation:
          event.step === "commit"
            ? { ...creation, committed: true }
            : { ...creation, labelled: true },
      };
    case "issue":
      return {
        creation: { ...creation, issues: { ...creation.issues, [event.ticketId]: event.number } },
      };
    case "complete":
      return { stage: "created", creation: { ...creation, completedAt: now } };
    case "paused":
    case "error":
      return null;
  }
}

/**
 * Drops a creation that never got a repo (say, the name turned out to be taken), back to the
 * tickets. Once a repo exists the log stays, and the only way on is Resume.
 */
export function abandonCreation(project: Project): Partial<Project> | null {
  if (project.stage !== "creating" || project.creation?.repo !== null) return null;
  return { stage: "tickets", creation: null };
}

/**
 * The body of the next create request. It resumes once the repo exists, or when the user chose
 * an existing Keel repo; the server decides whether that's safe.
 */
export function creationRequest(project: Project): CreateRequest | null {
  const { creation, approved, tickets } = project;
  if (project.stage !== "creating" || !creation || !approved || !tickets) return null;
  return {
    repoName: creation.repoName,
    resume: creation.existing || creation.repo !== null,
    spec: approved,
    transcript: toTranscript(project.history),
    tickets: tickets.items,
  };
}
