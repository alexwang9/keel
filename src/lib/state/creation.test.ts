import { describe, expect, it } from "vitest";
import type { CreateEvent } from "@/lib/github/events";
import { SpecSchema } from "@/lib/spec/schema";
import { creationRequest } from "@/lib/state/creation";
import {
  currentProject,
  initialWorkspace,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/lib/state/reducer";
import { emptyState, PersistedStateSchema, type Project } from "@/lib/state/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";
const T0 = "2026-11-12T10:00:00.000Z";
const T1 = "2026-11-12T10:01:00.000Z";
const spec = SpecSchema.parse(completeDraft);
const repo = { fullName: "octocat/shelf", htmlUrl: "https://github.com/octocat/shelf" };

const run = (from: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState =>
  actions.reduce(workspaceReducer, from);

const withTickets = (): WorkspaceState =>
  run(
    initialWorkspace(emptyState()),
    { type: "start", id: ID, now: T0, text: "A book club app." },
    { type: "specPatch", draft: completeDraft },
    {
      type: "turn",
      now: T0,
      messages: [{ role: "assistant", content: [{ type: "text", text: "Who is it for?" }] }],
    },
    { type: "complete", now: T0, spec },
    { type: "approve", now: T0 },
    { type: "ticketsGenerated", now: T0, tickets: shelfTickets, source: spec },
  );

const project = (state: WorkspaceState): Project => {
  const current = currentProject(state.persisted);
  if (!current) throw new Error("no current project");
  return current;
};

const start: WorkspaceAction = {
  type: "createStarted",
  now: T1,
  repoName: "shelf",
  existing: false,
};
const progress = (event: CreateEvent): WorkspaceAction => ({
  type: "createProgress",
  now: T1,
  event,
});

describe("repo creation state", () => {
  it("starts an empty log and moves to creating", () => {
    const state = run(withTickets(), start);
    expect(project(state)).toMatchObject({
      stage: "creating",
      creation: {
        repoName: "shelf",
        existing: false,
        repo: null,
        committed: false,
        labelled: false,
        issues: {},
        startedAt: T1,
        completedAt: null,
      },
    });
    expect(PersistedStateSchema.safeParse(state.persisted).success).toBe(true);
  });

  it("refuses to start while something blocks creation", () => {
    const edited = run(withTickets(), {
      type: "editTickets",
      now: T1,
      tickets: [...shelfTickets, ticket("T5")],
    });
    expect(run(edited, start)).toBe(edited);
  });

  it("records each persisted step, then completes", () => {
    const state = run(
      withTickets(),
      start,
      progress({ type: "repo", repo, created: true }),
      progress({ type: "step", step: "commit", status: "done" }),
      progress({ type: "step", step: "labels", status: "done" }),
      progress({ type: "issue", ticketId: "T1", number: 1, existed: false }),
      progress({ type: "issue", ticketId: "T2", number: 2, existed: true }),
    );
    expect(project(state).creation).toMatchObject({
      repo,
      committed: true,
      labelled: true,
      issues: { T1: 1, T2: 2 },
    });

    const done = run(state, progress({ type: "complete" }));
    expect(project(done)).toMatchObject({ stage: "created", creation: { completedAt: T1 } });
    expect(PersistedStateSchema.safeParse(done.persisted).success).toBe(true);
  });

  it("doesn't save pauses or errors", () => {
    const state = run(withTickets(), start);
    const error = {
      type: "error",
      error: { step: "repo", code: "name_taken", message: "x", retryable: false },
    } as const;
    expect(run(state, progress({ type: "paused" }), progress(error))).toBe(state);
  });

  it("locks the tickets and the spec once creation starts", () => {
    const state = run(withTickets(), start);
    const locked: WorkspaceAction[] = [
      { type: "editTickets", now: T1, tickets: [ticket("T1")] },
      { type: "reopen", now: T1 },
      { type: "ticketsGenerated", now: T1, tickets: [ticket("T1")], source: spec },
      start,
    ];
    for (const action of locked) expect(run(state, action)).toBe(state);
  });

  it("goes back to the tickets only while no repo exists", () => {
    const back = run(withTickets(), start, { type: "createAbandoned", now: T1 });
    expect(project(back)).toMatchObject({ stage: "tickets", creation: null });

    const withRepo = run(withTickets(), start, progress({ type: "repo", repo, created: true }));
    expect(run(withRepo, { type: "createAbandoned", now: T1 })).toBe(withRepo);
  });

  it("ignores progress outside creation", () => {
    const state = withTickets();
    expect(run(state, progress({ type: "repo", repo, created: true }))).toBe(state);
  });
});

describe("creationRequest", () => {
  it("creates first, then resumes once the repo exists", () => {
    const started = run(withTickets(), start);
    expect(creationRequest(project(started))).toEqual({
      repoName: "shelf",
      resume: false,
      spec,
      transcript: [
        { role: "user", text: "A book club app." },
        { role: "assistant", text: "Who is it for?" },
      ],
      tickets: shelfTickets,
    });
    const withRepo = run(started, progress({ type: "repo", repo, created: true }));
    expect(creationRequest(project(withRepo))?.resume).toBe(true);
  });

  it("resumes from the start when continuing into an existing Keel repo", () => {
    const state = run(withTickets(), { ...start, existing: true });
    expect(creationRequest(project(state))?.resume).toBe(true);
  });

  it("is null outside creation", () => {
    expect(creationRequest(project(withTickets()))).toBeNull();
  });
});
