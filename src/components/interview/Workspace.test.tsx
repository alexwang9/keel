import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/interview/Workspace";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { SpecSchema } from "@/lib/spec/schema";
import { PersistedStateSchema, STORAGE_KEY, type PersistedState } from "@/lib/state/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { events, interviewApi } from "@/test/msw/sse-routes";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";
const T0 = "2026-11-12T10:00:00.000Z";

const assistant = (text: string): HistoryMessage => ({
  role: "assistant",
  content: [
    { type: "thinking", thinking: "hidden reasoning", signature: "sig" },
    { type: "text", text },
  ],
});

const saved = (
  history: HistoryMessage[],
  extra: Partial<PersistedState["projects"][string]> = {},
) =>
  JSON.stringify({
    version: 1,
    currentProjectId: ID,
    projects: {
      [ID]: {
        id: ID,
        createdAt: T0,
        updatedAt: T0,
        stage: "interview",
        history,
        draft: {},
        spec: null,
        ...extra,
      },
    },
  });

const stored = (): PersistedState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) throw new Error("nothing saved");
  return PersistedStateSchema.parse(JSON.parse(raw));
};

const storedHistory = (): HistoryMessage[] => {
  const state = stored();
  return state.currentProjectId ? (state.projects[state.currentProjectId]?.history ?? []) : [];
};

async function say(text: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Message" }), `${text}{Enter}`);
}

const specPanel = () => within(screen.getByRole("complementary", { name: "Spec draft" }));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Workspace", () => {
  it("streams the reply, fills the spec panel and saves the turn", async () => {
    const api = interviewApi([
      events(
        { type: "text", text: "Nice. Who " },
        { type: "text", text: "is it for?" },
        { type: "specPatch", ops: [], draft: { name: "Shelf" } },
        { type: "turn", messages: [assistant("Nice. Who is it for?")] },
      ),
    ]);
    render(<Workspace />);

    await say("A book club app");

    expect(await screen.findByText("Nice. Who is it for?")).toBeInTheDocument();
    expect(screen.queryByText("hidden reasoning")).not.toBeInTheDocument();
    expect(specPanel().getByText("Shelf")).toBeInTheDocument();
    expect(api.bodies).toEqual([
      { history: [{ role: "user", content: "A book club app" }], draft: {} },
    ]);
    expect(storedHistory()).toHaveLength(2);
    expect(Object.values(stored().projects)[0]).toMatchObject({ draft: { name: "Shelf" } });
  });

  it("restores the conversation and draft after a refresh", () => {
    localStorage.setItem(
      STORAGE_KEY,
      saved([{ role: "user", content: "A book club app" }, assistant("Who is it for?")], {
        draft: { name: "Shelf" },
      }),
    );

    render(<Workspace />);

    expect(screen.getByText("A book club app")).toBeInTheDocument();
    expect(screen.getByText("Who is it for?")).toBeInTheDocument();
    expect(specPanel().getByText("Shelf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry when a refresh interrupted the reply", async () => {
    const history: HistoryMessage[] = [{ role: "user", content: "A book club app" }];
    localStorage.setItem(STORAGE_KEY, saved(history));
    const api = interviewApi([events({ type: "turn", messages: [assistant("Who is it for?")] })]);
    render(<Workspace />);

    expect(screen.getByRole("alert")).toHaveTextContent("Your last message didn't get a reply.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Who is it for?")).toBeInTheDocument();
    expect(api.bodies).toEqual([{ history, draft: {} }]);
  });

  it("drops a failed reply and resends the same history on retry", async () => {
    const error = { code: "rate_limited", message: "Too many requests.", retryable: true } as const;
    const api = interviewApi([
      events(
        { type: "text", text: "Half a rep" },
        { type: "specPatch", ops: [], draft: { name: "Lost" } },
        { type: "error", error },
      ),
      events({ type: "turn", messages: [assistant("Who is it for?")] }),
    ]);
    render(<Workspace />);
    await say("A book club app");

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.queryByText("Half a rep")).not.toBeInTheDocument();
    expect(specPanel().queryByText("Lost")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Who is it for?")).toBeInTheDocument();
    expect(api.bodies[1]).toEqual(api.bodies[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows non-retryable errors without a retry, and a sign-in link when signed out", async () => {
    interviewApi([{ kind: "status", status: 401 }]);
    render(<Workspace />);
    await say("A book club app");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign in again");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("moves to spec review when the interview completes", async () => {
    const spec = SpecSchema.parse(completeDraft);
    interviewApi([
      events(
        { type: "specPatch", ops: [], draft: completeDraft },
        { type: "turn", messages: [assistant("That's everything.")] },
        { type: "complete", spec },
      ),
    ]);
    render(<Workspace />);
    await say("Let's finish");

    const review = await screen.findByRole("region", { name: "Spec review" });
    expect(within(review).getByRole("region", { name: "Name" })).toHaveTextContent("Shelf");
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
    expect(Object.values(stored().projects)[0]).toMatchObject({ stage: "review" });
  });

  it("restores the review stage after a refresh", () => {
    const spec = SpecSchema.parse(completeDraft);
    localStorage.setItem(
      STORAGE_KEY,
      saved([{ role: "user", content: "hi" }], { stage: "review", spec, draft: completeDraft }),
    );

    render(<Workspace />);

    expect(screen.getByRole("region", { name: "Spec review" })).toHaveTextContent("Shelf");
  });

  describe("spec review", () => {
    const spec = SpecSchema.parse(completeDraft);
    const history: HistoryMessage[] = [{ role: "user", content: "hi" }, assistant("Done.")];
    const inReview = () => {
      localStorage.setItem(
        STORAGE_KEY,
        saved(history, { stage: "review", spec, draft: completeDraft }),
      );
      render(<Workspace />);
    };
    const project = () => Object.values(stored().projects)[0];

    it("saves an edit, approves, and reopens review from the approved spec", async () => {
      inReview();
      await userEvent.click(screen.getByRole("button", { name: "Edit Name" }));
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "Shelfie");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(project()).toMatchObject({ draft: { name: "Shelfie" }, spec: { name: "Shelf" } });

      await userEvent.click(screen.getByRole("button", { name: "Approve spec" }));
      const approved = screen.getByRole("region", { name: "Approved spec" });
      expect(approved).toHaveTextContent("# Shelfie");
      expect(project()).toMatchObject({ stage: "approved", approved: { name: "Shelfie" } });

      await userEvent.click(screen.getByRole("button", { name: "Edit spec" }));
      expect(screen.getByRole("region", { name: "Spec review" })).toBeInTheDocument();
      expect(project()).toMatchObject({ stage: "review", approved: { name: "Shelfie" } });
    });

    it("goes back to the interview with one message describing the edits", async () => {
      const api = interviewApi([events({ type: "turn", messages: [assistant("Got it.")] })]);
      inReview();
      await userEvent.click(screen.getByRole("button", { name: "Edit Name" }));
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "Shelfie");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await userEvent.click(screen.getByRole("button", { name: "Back to interview" }));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Note for the interviewer (optional)" }),
        "Please add voting deadlines.",
      );
      await userEvent.click(screen.getByRole("button", { name: "Send and resume" }));

      expect(await screen.findByText("Got it.")).toBeInTheDocument();
      const sent = {
        role: "user",
        content:
          "Please add voting deadlines.\n\nI edited the spec in the form. These changes are already applied:\n- Changed the name to: Shelfie",
      };
      expect(api.bodies).toEqual([
        { history: [...history, sent], draft: { ...completeDraft, name: "Shelfie" } },
      ]);
      expect(project()).toMatchObject({ stage: "interview" });
      expect(storedHistory()).toEqual([...history, sent, assistant("Got it.")]);
    });

    it("won't go back to the interview with nothing to say", async () => {
      inReview();
      await userEvent.click(screen.getByRole("button", { name: "Back to interview" }));
      await userEvent.click(screen.getByRole("button", { name: "Send and resume" }));

      expect(screen.getByRole("alert")).toHaveTextContent("Add a note for the interviewer");
      expect(storedHistory()).toEqual(history);
    });
  });

  it("starts over after confirmation", async () => {
    localStorage.setItem(STORAGE_KEY, saved([{ role: "user", content: "A book club app" }]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Workspace />);

    await userEvent.click(screen.getByRole("button", { name: "Start over" }));

    expect(screen.queryByText("A book club app")).not.toBeInTheDocument();
    expect(stored()).toEqual({ version: 1, currentProjectId: null, projects: {} });
  });

  describe("with unreadable saved state", () => {
    it("offers a download, then resets and overwrites it", async () => {
      localStorage.setItem(STORAGE_KEY, "{broken");
      const createObjectURL = vi.fn(() => "blob:keel");
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      render(<Workspace />);

      expect(screen.getByRole("alert")).toHaveTextContent("couldn't read your saved project");
      await userEvent.click(screen.getByRole("button", { name: "Download JSON" }));
      const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
      expect(await blob.text()).toBe("{broken");

      await userEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
      expect(stored()).toEqual({ version: 1, currentProjectId: null, projects: {} });
    });

    it("asks before resetting without a download", async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2 }));
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<Workspace />);

      await userEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(confirm).toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ version: 2 }));
    });
  });
});
