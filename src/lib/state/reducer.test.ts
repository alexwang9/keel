import { describe, expect, it } from "vitest";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { SpecSchema } from "@/lib/spec/schema";
import {
  awaitingReply,
  createBlockers,
  currentProject,
  initialWorkspace,
  ticketsStale,
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

const assistant = (text: string): HistoryMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
});
const rateLimited = { code: "rate_limited", message: "Slow down.", retryable: true } as const;

const run = (...actions: WorkspaceAction[]): WorkspaceState =>
  actions.reduce(workspaceReducer, initialWorkspace(emptyState()));
const runFrom = (from: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState =>
  actions.reduce(workspaceReducer, from);

const project = (state: WorkspaceState): Project => {
  const current = currentProject(state.persisted);
  if (!current) throw new Error("no current project");
  return current;
};

const started: WorkspaceAction = { type: "start", id: ID, now: T0, text: "A book club app." };

describe("workspaceReducer", () => {
  it("starts a project with the first message and begins streaming", () => {
    const state = run(started);

    expect(project(state)).toMatchObject({
      id: ID,
      stage: "interview",
      history: [{ role: "user", content: "A book club app." }],
      draft: {},
      spec: null,
      approved: null,
    });
    expect(state.transient.status).toBe("streaming");
    expect(PersistedStateSchema.safeParse(state.persisted).success).toBe(true);
  });

  it("accumulates streamed text, then commits the turn and its draft together", () => {
    const streamed = run(
      started,
      { type: "text", text: "Who " },
      { type: "text", text: "is it for?" },
      { type: "specPatch", draft: { name: "Shelf" } },
    );
    expect(streamed.transient.streamingText).toBe("Who is it for?");
    expect(project(streamed).draft).toEqual({});

    const committed = workspaceReducer(streamed, {
      type: "turn",
      now: T1,
      messages: [assistant("Who is it for?")],
    });
    expect(project(committed).draft).toEqual({ name: "Shelf" });
    expect(project(committed).history).toHaveLength(2);
    expect(project(committed).updatedAt).toBe(T1);
    expect(committed.transient).toMatchObject({ streamingText: "", pendingDraft: null });
  });

  it("goes idle when the stream finishes", () => {
    const state = run(
      started,
      { type: "turn", now: T1, messages: [assistant("Hi")] },
      {
        type: "finished",
      },
    );

    expect(state.transient.status).toBe("idle");
    expect(awaitingReply(project(state))).toBe(false);
  });

  it("drops provisional text and drafts on error, keeping the history it can resend", () => {
    const state = run(
      started,
      { type: "text", text: "Half a repl" },
      { type: "specPatch", draft: { name: "Shelf" } },
      { type: "error", error: rateLimited },
    );

    expect(state.transient).toEqual({
      status: "error",
      streamingText: "",
      pendingDraft: null,
      error: rateLimited,
    });
    expect(project(state).draft).toEqual({});
    expect(project(state).history).toEqual([{ role: "user", content: "A book club app." }]);
    expect(awaitingReply(project(state))).toBe(true);
  });

  it("keeps turns committed before a later error in the same request", () => {
    const toolResults: HistoryMessage = {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
    };
    const state = run(
      started,
      { type: "specPatch", draft: { name: "Shelf" } },
      { type: "turn", now: T1, messages: [assistant("Noted."), toolResults] },
      { type: "text", text: "lost" },
      { type: "error", error: rateLimited },
    );

    expect(project(state).draft).toEqual({ name: "Shelf" });
    expect(project(state).history).toHaveLength(3);
    expect(awaitingReply(project(state))).toBe(true);
  });

  it("retries without changing the history", () => {
    const failed = run(started, { type: "error", error: rateLimited });
    const retried = workspaceReducer(failed, { type: "retry" });

    expect(retried.transient).toMatchObject({ status: "streaming", error: null });
    expect(retried.persisted).toBe(failed.persisted);
  });

  it("appends the next user message", () => {
    const state = run(
      started,
      { type: "turn", now: T1, messages: [assistant("Who is it for?")] },
      { type: "finished" },
      { type: "send", now: T1, text: "Small clubs." },
    );

    expect(project(state).history.at(-1)).toEqual({ role: "user", content: "Small clubs." });
    expect(state.transient.status).toBe("streaming");
  });

  it("moves to review with the spec when the interview completes", () => {
    const spec = SpecSchema.parse(completeDraft);
    const state = run(started, { type: "complete", now: T1, spec });

    expect(project(state)).toMatchObject({ stage: "review", spec });
    expect(state.transient.status).toBe("idle");
    expect(awaitingReply(project(state))).toBe(false);
    expect(PersistedStateSchema.safeParse(state.persisted).success).toBe(true);
  });

  describe("spec review", () => {
    const spec = SpecSchema.parse(completeDraft);
    const T2 = "2026-11-12T10:02:00.000Z";
    const inReview = (): WorkspaceState =>
      run(
        started,
        { type: "specPatch", draft: completeDraft },
        { type: "turn", now: T1, messages: [assistant("Done.")] },
        { type: "complete", now: T1, spec },
      );
    const renamed = { ...completeDraft, name: "Shelfie" };

    it("stores an edited draft and keeps the interview's spec as the baseline", () => {
      const state = workspaceReducer(inReview(), { type: "editDraft", now: T2, draft: renamed });

      expect(project(state)).toMatchObject({
        stage: "review",
        draft: renamed,
        spec,
        updatedAt: T2,
      });
    });

    it("approves only a complete draft", () => {
      const incomplete = workspaceReducer(inReview(), {
        type: "editDraft",
        now: T2,
        draft: { ...completeDraft, features: [] },
      });
      expect(workspaceReducer(incomplete, { type: "approve", now: T2 })).toBe(incomplete);

      const approved = workspaceReducer(inReview(), { type: "approve", now: T2 });
      expect(project(approved)).toMatchObject({ stage: "approved", approved: spec });
      expect(PersistedStateSchema.safeParse(approved.persisted).success).toBe(true);
    });

    it("reopens review when an approved spec is edited, keeping the last approval", () => {
      const approved = workspaceReducer(inReview(), { type: "approve", now: T2 });

      const reopened = workspaceReducer(approved, { type: "reopen", now: T2 });
      expect(project(reopened)).toMatchObject({ stage: "review", approved: spec });

      const edited = workspaceReducer(approved, { type: "editDraft", now: T2, draft: renamed });
      expect(project(edited)).toMatchObject({ stage: "review", draft: renamed, approved: spec });

      const reapproved = workspaceReducer(edited, { type: "approve", now: T2 });
      expect(project(reapproved).approved?.name).toBe("Shelfie");
    });

    it("goes back to the interview with exactly one appended message", () => {
      const before = project(inReview()).history;
      const state = workspaceReducer(inReview(), {
        type: "backToInterview",
        now: T2,
        text: "I renamed it.",
      });

      expect(project(state).stage).toBe("interview");
      expect(project(state).history).toEqual([
        ...before,
        { role: "user", content: "I renamed it." },
      ]);
      expect(state.transient.status).toBe("streaming");
      expect(awaitingReply(project(state))).toBe(true);
    });

    it("ignores review actions during the interview", () => {
      const interviewing = run(started, { type: "finished" });
      const actions: WorkspaceAction[] = [
        { type: "editDraft", now: T2, draft: renamed },
        { type: "approve", now: T2 },
        { type: "reopen", now: T2 },
        { type: "backToInterview", now: T2, text: "x" },
      ];
      for (const action of actions) {
        expect(workspaceReducer(interviewing, action)).toBe(interviewing);
      }
    });
  });

  describe("tickets", () => {
    const spec = SpecSchema.parse(completeDraft);
    const T2 = "2026-11-12T10:02:00.000Z";
    const T3 = "2026-11-12T10:03:00.000Z";
    const approved = (): WorkspaceState =>
      run(
        started,
        { type: "specPatch", draft: completeDraft },
        { type: "turn", now: T1, messages: [assistant("Done.")] },
        { type: "complete", now: T1, spec },
        { type: "approve", now: T2 },
      );
    const generated: WorkspaceAction = {
      type: "ticketsGenerated",
      now: T3,
      tickets: shelfTickets,
      source: spec,
    };
    const renamed = { ...completeDraft, name: "Shelfie" };

    it("stores generated tickets with their source spec and moves to the ticket list", () => {
      const state = workspaceReducer(approved(), generated);

      expect(project(state)).toMatchObject({
        stage: "tickets",
        tickets: { items: shelfTickets, checked: shelfTickets, source: spec, generatedAt: T3 },
      });
      expect(ticketsStale(project(state))).toBe(false);
      expect(createBlockers(project(state))).toEqual([]);
      expect(PersistedStateSchema.safeParse(state.persisted).success).toBe(true);
    });

    it("ignores generated tickets before approval", () => {
      const reviewing = workspaceReducer(approved(), { type: "reopen", now: T3 });
      expect(workspaceReducer(reviewing, generated)).toBe(reviewing);
    });

    it("marks tickets stale once a changed spec is approved, and regenerating clears it", () => {
      const withTickets = workspaceReducer(approved(), generated);
      const edited = runFrom(
        withTickets,
        { type: "reopen", now: T3 },
        { type: "editDraft", now: T3, draft: renamed },
      );
      // Not stale yet: the edit hasn't been approved.
      expect(ticketsStale(project(edited))).toBe(false);

      const reapproved = workspaceReducer(edited, { type: "approve", now: T3 });
      expect(project(reapproved).stage).toBe("approved");
      expect(ticketsStale(project(reapproved))).toBe(true);

      const fresh = project(reapproved).approved ?? spec;
      const regenerated = workspaceReducer(reapproved, { ...generated, source: fresh });
      expect(ticketsStale(project(regenerated))).toBe(false);
    });

    it("goes from the approved spec to existing tickets, and back to review", () => {
      const withTickets = workspaceReducer(approved(), generated);
      const reopened = workspaceReducer(withTickets, { type: "reopen", now: T3 });
      expect(project(reopened)).toMatchObject({ stage: "review", tickets: { items: shelfTickets } });

      const reapproved = workspaceReducer(reopened, { type: "approve", now: T3 });
      const viewing = workspaceReducer(reapproved, { type: "viewTickets", now: T3 });
      expect(project(viewing).stage).toBe("tickets");
    });

    it("stores edited tickets and keeps the checked list", () => {
      const edited = [...shelfTickets, ticket("T5", ["T9"])];
      const state = runFrom(workspaceReducer(approved(), generated), {
        type: "editTickets",
        now: T3,
        tickets: edited,
      });

      expect(project(state).tickets).toMatchObject({ items: edited, checked: shelfTickets });
      expect(PersistedStateSchema.safeParse(state.persisted).success).toBe(true);
      expect(createBlockers(project(state))).toEqual([
        "Fix 1 dependency problem.",
        "Check the impact of 1 edited ticket on the rest.",
      ]);
    });

    it("ignores ticket edits outside the ticket list", () => {
      const reopened = runFrom(workspaceReducer(approved(), generated), {
        type: "reopen",
        now: T3,
      });
      const edit: WorkspaceAction = { type: "editTickets", now: T3, tickets: [] };
      expect(workspaceReducer(reopened, edit)).toBe(reopened);
    });

    it("blocks creation on an empty list and on stale tickets", () => {
      const withTickets = workspaceReducer(approved(), generated);
      const emptied = workspaceReducer(withTickets, { type: "editTickets", now: T3, tickets: [] });
      expect(createBlockers(project(emptied))).toEqual([
        "Add at least one ticket.",
        "Check the impact of 4 edited tickets on the rest.",
      ]);

      const stale = { ...project(withTickets), approved: SpecSchema.parse(renamed) };
      expect(createBlockers(stale)).toEqual([
        "The spec changed after these tickets were generated. Regenerate them.",
      ]);
      expect(createBlockers(project(approved()))).toEqual(["There are no tickets yet."]);
    });

    it("ignores viewTickets when there are none", () => {
      const state = approved();
      expect(workspaceReducer(state, { type: "viewTickets", now: T3 })).toBe(state);
    });
  });

  it("ignores project actions when there is no project", () => {
    const state = run({ type: "send", now: T0, text: "hello" });

    expect(state.persisted).toEqual(emptyState());
  });

  it("resets to an empty state", () => {
    const state = run(started, { type: "reset" });

    expect(state).toEqual(initialWorkspace(emptyState()));
  });
});
