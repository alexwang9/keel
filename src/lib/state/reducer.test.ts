import { describe, expect, it } from "vitest";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { SpecSchema } from "@/lib/spec/schema";
import {
  awaitingReply,
  currentProject,
  initialWorkspace,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/lib/state/reducer";
import { emptyState, PersistedStateSchema, type Project } from "@/lib/state/schema";
import { completeDraft } from "@/test/fixtures/spec";

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

  it("ignores project actions when there is no project", () => {
    const state = run({ type: "send", now: T0, text: "hello" });

    expect(state.persisted).toEqual(emptyState());
  });

  it("resets to an empty state", () => {
    const state = run(started, { type: "reset" });

    expect(state).toEqual(initialWorkspace(emptyState()));
  });
});
