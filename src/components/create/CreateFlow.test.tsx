import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/interview/Workspace";
import type { CreateEvent } from "@/lib/github/events";
import type { NameCheck } from "@/lib/github/repo-name";
import { shelfTickets } from "@/test/fixtures/tickets";
import { server } from "@/test/msw/server";
import { events, sseApi, type SseReply } from "@/test/msw/sse-routes";
import { spec, storedProject as project, storeProject as store, T0 } from "@/test/stored-project";

const repo = { fullName: "octocat/shelf", htmlUrl: "https://github.com/octocat/shelf" };
const ticketSet = { items: shelfTickets, source: spec, generatedAt: T0 };

const createApi = (replies: SseReply<CreateEvent>[]) => sseApi("/api/github/create", replies);

/** Answers name checks from a map; unknown names are available. */
function nameApi(taken: Record<string, NameCheck> = {}): string[] {
  const asked: string[] = [];
  server.use(
    http.get("*/api/github/repo-name", ({ request }) => {
      const name = new URL(request.url).searchParams.get("name") ?? "";
      asked.push(name);
      return HttpResponse.json(taken[name] ?? { available: true });
    }),
  );
  return asked;
}

const upToLabels: CreateEvent[] = [
  { type: "repo", repo, created: true },
  { type: "step", step: "commit", status: "done" },
  { type: "step", step: "labels", status: "done" },
];
const issue = (n: number, existed = false): CreateEvent => ({
  type: "issue",
  ticketId: `T${String(n)}`,
  number: n,
  existed,
});
const allIssues = [1, 2, 3, 4].map((n) => issue(n));

async function openNameStep(): Promise<void> {
  store({ stage: "tickets", tickets: ticketSet });
  render(<Workspace />);
  await userEvent.click(screen.getByRole("button", { name: "Create repo" }));
}

const createButton = () => screen.getByRole("button", { name: "Create repo" });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("repo creation: name step", () => {
  it("prefills the name from the spec and validates it as you type", async () => {
    await openNameStep();
    const input = screen.getByRole("textbox", { name: "Repo name" });
    expect(input).toHaveValue("shelf");

    await userEvent.clear(input);
    await userEvent.type(input, "my shelf");
    expect(screen.getByText(/Use only letters, digits/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it("offers a free alternative for a taken name", async () => {
    const asked = nameApi({ shelf: { available: false, keel: false, suggestion: "shelf-2" } });
    const api = createApi([events(...upToLabels, ...allIssues, { type: "complete" })]);
    await openNameStep();

    await userEvent.click(createButton());
    expect(await screen.findByText(/You already have a repo called/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue in/ })).not.toBeInTheDocument();
    expect(createButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Use shelf-2" }));
    expect(screen.getByRole("textbox", { name: "Repo name" })).toHaveValue("shelf-2");
    await userEvent.click(createButton());

    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(asked).toEqual(["shelf", "shelf-2"]);
    expect(api.bodies).toEqual([expect.objectContaining({ repoName: "shelf-2", resume: false })]);
  });

  it("continues into an existing Keel repo with the same name", async () => {
    nameApi({ shelf: { available: false, keel: true, suggestion: "shelf-2" } });
    const api = createApi([
      events(
        { type: "repo", repo, created: false },
        { type: "step", step: "commit", status: "skipped" },
        { type: "step", step: "labels", status: "done" },
        ...allIssues,
        { type: "complete" },
      ),
    ]);
    await openNameStep();

    await userEvent.click(createButton());
    await userEvent.click(await screen.findByRole("button", { name: "Continue in shelf" }));

    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(api.bodies).toEqual([expect.objectContaining({ repoName: "shelf", resume: true })]);
  });

  it("shows a failed name check and stays on the tickets", async () => {
    server.use(http.get("*/api/github/repo-name", () => HttpResponse.json({}, { status: 502 })));
    await openNameStep();
    await userEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't check that name");
    expect(project()?.stage).toBe("tickets");
  });
});

describe("repo creation: progress", () => {
  it("creates everything, saves the log and links to GitHub", async () => {
    nameApi();
    const api = createApi([events(...upToLabels, ...allIssues, { type: "complete" })]);
    await openNameStep();
    await userEvent.click(createButton());

    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open octocat/shelf" })).toHaveAttribute(
      "href",
      repo.htmlUrl,
    );
    expect(screen.getByRole("link", { name: "View the issues" })).toHaveAttribute(
      "href",
      `${repo.htmlUrl}/issues`,
    );
    const t4 = screen.getByRole("listitem", { name: "T4: Vote on the next book" });
    expect(within(t4).getByRole("link", { name: "#4" })).toHaveAttribute(
      "href",
      `${repo.htmlUrl}/issues/4`,
    );
    expect(api.bodies).toEqual([
      expect.objectContaining({ repoName: "shelf", resume: false, spec, tickets: shelfTickets }),
    ]);
    expect(project()).toMatchObject({
      stage: "created",
      creation: { repo, committed: true, labelled: true, issues: { T1: 1, T2: 2, T3: 3, T4: 4 } },
    });
  });

  it("shows what was created when it fails, and resumes to finish", async () => {
    nameApi();
    const failed: CreateEvent = {
      type: "error",
      error: {
        step: "issues",
        code: "github_error",
        message: "GitHub had a problem.",
        retryable: true,
      },
    };
    const api = createApi([
      events(...upToLabels, issue(1), issue(2), failed),
      events(
        { type: "repo", repo, created: false },
        { type: "step", step: "commit", status: "skipped" },
        { type: "step", step: "labels", status: "done" },
        issue(1, true),
        issue(2, true),
        issue(3),
        issue(4),
        { type: "complete" },
      ),
    ]);
    await openNameStep();
    await userEvent.click(createButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("GitHub had a problem.");
    expect(screen.getByText("Issues (2 of 4)")).toBeInTheDocument();
    const t2 = screen.getByRole("listitem", { name: "T2: Add a book" });
    expect(within(t2).getByText("Done")).toBeInTheDocument();
    const t3 = screen.getByRole("listitem", { name: "T3: Book status" });
    expect(within(t3).getByText("Waiting")).toBeInTheDocument();
    // A repo exists, so there's no going back to rename.
    expect(screen.queryByRole("button", { name: "Change name" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(api.bodies[1]).toMatchObject({ repoName: "shelf", resume: true });
  });

  it("continues automatically after a pause", async () => {
    nameApi();
    const api = createApi([
      events(...upToLabels, issue(1), issue(2), { type: "paused" }),
      events(issue(1, true), issue(2, true), issue(3), issue(4), { type: "complete" }),
    ]);
    await openNameStep();
    await userEvent.click(createButton());

    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(api.bodies).toHaveLength(2);
    expect(api.bodies[1]).toMatchObject({ resume: true });
  });

  it("stops a pause that made no progress, instead of looping", async () => {
    nameApi();
    createApi([
      events(...upToLabels, issue(1), { type: "paused" }),
      events(issue(1, true), { type: "paused" }),
    ]);
    await openNameStep();
    await userEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("responding slowly");
  });

  it("offers a new name when the name turns out to be taken", async () => {
    nameApi();
    const taken: CreateEvent = {
      type: "error",
      error: { step: "repo", code: "name_taken", message: "Pick another name.", retryable: false },
    };
    createApi([events(taken)]);
    await openNameStep();
    await userEvent.click(createButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick another name.");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change name" }));
    expect(screen.getByRole("region", { name: "Tickets" })).toBeInTheDocument();
    expect(project()).toMatchObject({ stage: "tickets", creation: null });
  });

  it("after a refresh mid-creation, shows the saved log and resumes", async () => {
    const api = createApi([
      events({ type: "repo", repo, created: false }, issue(1, true), issue(2), issue(3), issue(4), {
        type: "complete",
      }),
    ]);
    store({
      stage: "creating",
      tickets: ticketSet,
      creation: {
        repoName: "shelf",
        existing: false,
        repo,
        committed: true,
        labelled: true,
        issues: { T1: 1 },
        startedAt: T0,
        completedAt: null,
      },
    });
    render(<Workspace />);

    expect(screen.getByText(/Creation stopped before it finished/)).toBeInTheDocument();
    expect(screen.getByText("Issues (1 of 4)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("heading", { name: "Repo created" })).toBeInTheDocument();
    expect(api.bodies).toEqual([expect.objectContaining({ resume: true })]);
  });

  it("treats a stream that ends without an outcome as interrupted", async () => {
    nameApi();
    createApi([{ kind: "raw", body: `event: repo\ndata: ${JSON.stringify(upToLabels[0])}\n\n` }]);
    await openNameStep();
    await userEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Creation was interrupted");
    expect(project()?.creation?.repo).toEqual(repo);
  });

  it("shows a sign-in link when GitHub rejects the token", async () => {
    nameApi();
    const expired: CreateEvent = {
      type: "error",
      error: { step: "repo", code: "unauthorized", message: "Sign in again.", retryable: false },
    };
    createApi([events(expired)]);
    await openNameStep();
    await userEvent.click(createButton());
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
  });
});
