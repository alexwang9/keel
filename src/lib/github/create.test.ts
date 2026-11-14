import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "@/lib/github/client";
import { runCreate, type CreateOptions } from "@/lib/github/create";
import type { CreateEvent } from "@/lib/github/events";
import { LABELS } from "@/lib/github/issues";
import type { CreateRequest } from "@/lib/github/request";
import { renderSpecMarkdown } from "@/lib/spec/render";
import { SpecSchema } from "@/lib/spec/schema";
import { parseIssueBody } from "@/lib/tickets/issue-body";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";
import { fakeGitHub, type FakeGitHub } from "@/test/msw/github";
import { FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const spec = SpecSchema.parse(completeDraft);
const request: CreateRequest = {
  repoName: "shelf",
  resume: false,
  spec,
  transcript: [
    { role: "user", text: "A shared reading list for my book club." },
    { role: "assistant", text: "Who organises the club?" },
  ],
  tickets: shelfTickets,
};

const client = createGitHubClient(FAKE_TOKEN, { throttle: false, retries: 0 });
const options = (overrides: Partial<CreateOptions> = {}): CreateOptions => ({
  login: "octocat",
  deadlineMs: 60_000,
  now: () => 0,
  branchWait: { attempts: 3, delayMs: 0, sleep: () => Promise.resolve() },
  ...overrides,
});

async function run(
  body: CreateRequest,
  overrides?: Partial<CreateOptions>,
): Promise<CreateEvent[]> {
  const events: CreateEvent[] = [];
  for await (const event of runCreate(client, body, options(overrides))) events.push(event);
  return events;
}

let github: FakeGitHub;
beforeEach(() => {
  github = fakeGitHub();
  server.use(...github.handlers);
});

const repo = () => {
  const found = github.repos.get("octocat/shelf");
  if (!found) throw new Error("no repo");
  return found;
};

/** Ticket id → issue number, read back from the bodies the fake stored. */
const issueMap = () =>
  Object.fromEntries(
    repo().issues.map((issue) => {
      const parsed = parseIssueBody(issue.body ?? "");
      return [parsed.ok ? parsed.value.ticketId : "?", issue.number];
    }),
  );

describe("runCreate: happy path", () => {
  it("creates the repo, one commit, the labels and the issues in order", async () => {
    const events = await run(request);
    expect(events).toEqual([
      {
        type: "repo",
        repo: { fullName: "octocat/shelf", htmlUrl: "https://github.com/octocat/shelf" },
        created: true,
      },
      { type: "step", step: "commit", status: "done" },
      { type: "step", step: "labels", status: "done" },
      { type: "issue", ticketId: "T1", number: 1, existed: false },
      { type: "issue", ticketId: "T2", number: 2, existed: false },
      { type: "issue", ticketId: "T3", number: 3, existed: false },
      { type: "issue", ticketId: "T4", number: 4, existed: false },
      { type: "complete" },
    ]);
    expect(github.count("PATCH /repos/octocat/shelf/git/refs/heads/main")).toBe(1);
    expect(repo().commits).toHaveLength(2);
    expect([...repo().files.keys()].sort()).toEqual(["README.md", "SPEC.md", "docs/interview.md"]);
    expect(repo().files.get("SPEC.md")).toBe(renderSpecMarkdown(spec));
    expect(repo().files.get("docs/interview.md")).toContain("Who organises the club?");
    expect([...repo().labels]).toEqual(LABELS.map((label) => label.name));
  });

  it("writes real issue numbers into Depends on lines and labels each issue", async () => {
    await run(request);
    const t4 = repo().issues[3];
    expect(t4?.body).toContain("Depends on #2\nDepends on #3");
    expect(t4?.labels).toEqual(["size:L", "status:backlog"]);
    expect(t4?.title).toBe("Vote on the next book");
  });

  it("sorts tickets topologically before creating them", async () => {
    const reversed = [ticket("T2", ["T1"]), ticket("T1")];
    const events = await run({ ...request, tickets: reversed });
    expect(events.filter((event) => event.type === "issue")).toEqual([
      { type: "issue", ticketId: "T1", number: 1, existed: false },
      { type: "issue", ticketId: "T2", number: 2, existed: false },
    ]);
    expect(repo().issues[1]?.body).toContain("Depends on #1");
  });

  it("waits for the branch when GitHub hasn't made it yet", async () => {
    github.failOn("getRef", { status: 409, times: 2 });
    const events = await run(request);
    expect(events.at(-1)).toEqual({ type: "complete" });
    expect(github.count("GET /repos/octocat/shelf/git/ref/heads/main")).toBe(3);
  });
});

describe("runCreate: name collisions", () => {
  it("reports name_taken when the name is in use, even by a private repo", async () => {
    github.addRepo({ name: "Shelf", private: true });
    const events = await run(request);
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({
          step: "repo",
          code: "name_taken",
          retryable: false,
        }) as unknown,
      },
    ]);
  });
});

describe("runCreate: labels", () => {
  it("treats labels that already exist as created", async () => {
    github.addRepo({ name: "shelf" });
    repo().labels.add("size:M");
    repo().labels.add("status:backlog");
    const events = await run({ ...request, resume: true });
    expect(events).toContainEqual({ type: "step", step: "labels", status: "done" });
    expect(events.at(-1)).toEqual({ type: "complete" });
    expect(github.count("POST /repos/octocat/shelf/labels")).toBe(4);
  });
});

describe("runCreate: failure and resume", () => {
  it("stops at a failed issue, then resumes without duplicating any", async () => {
    github.failOn("createIssue", { status: 502, after: 2, times: 1 });
    const first = await run(request);
    expect(first.filter((event) => event.type === "issue")).toHaveLength(2);
    expect(first.at(-1)).toEqual({
      type: "error",
      error: expect.objectContaining({
        step: "issues",
        code: "github_error",
        retryable: true,
      }) as unknown,
    });

    const second = await run({ ...request, resume: true });
    expect(second).toEqual([
      expect.objectContaining({ type: "repo", created: false }),
      { type: "step", step: "commit", status: "skipped" },
      { type: "step", step: "labels", status: "done" },
      { type: "issue", ticketId: "T1", number: 1, existed: true },
      { type: "issue", ticketId: "T2", number: 2, existed: true },
      { type: "issue", ticketId: "T3", number: 3, existed: false },
      { type: "issue", ticketId: "T4", number: 4, existed: false },
      { type: "complete" },
    ]);
    // Two attempts at T3's issue (one failed), one for every other ticket: no duplicates.
    expect(github.count("POST /repos/octocat/shelf/issues")).toBe(5);
    expect(repo().issues).toHaveLength(4);
    expect(issueMap()).toEqual({ T1: 1, T2: 2, T3: 3, T4: 4 });
    expect(repo().commits).toHaveLength(2);
  });

  it("creates nothing when resumed after everything exists", async () => {
    await run(request);
    const again = await run({ ...request, resume: true });
    expect(again.filter((event) => event.type === "issue" && !event.existed)).toEqual([]);
    expect(repo().issues).toHaveLength(4);
  });

  it("ignores pull requests and other repo issues when reconciling", async () => {
    github.addRepo({ name: "shelf" });
    repo().issues.push(
      { number: 1, title: "Unrelated", body: "No marker here.", labels: [] },
      {
        number: 2,
        title: "A PR",
        body: "<!-- keel:ticket=T1 v1 -->\n\nx",
        labels: [],
        pullRequest: true,
      },
    );
    const events = await run({ ...request, resume: true });
    expect(events).toContainEqual({ type: "issue", ticketId: "T1", number: 3, existed: false });
  });

  it("resumes the commit into a repo that only has GitHub's initial commit", async () => {
    github.addRepo({ name: "shelf" });
    const events = await run({ ...request, resume: true });
    expect(events).toContainEqual({ type: "step", step: "commit", status: "done" });
    expect(repo().files.get("SPEC.md")).toBe(renderSpecMarkdown(spec));
  });

  it("refuses to resume into a repo with other commits and no SPEC.md", async () => {
    const existing = github.addRepo({ name: "shelf" });
    existing.commits.push("f".repeat(40));
    const events = await run({ ...request, resume: true });
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ step: "repo", code: "not_resumable" }) as unknown,
      },
    ]);
    expect(github.count("POST /repos/octocat/shelf/issues")).toBe(0);
  });

  it("refuses to resume into a Keel repo made from a different spec", async () => {
    const existing = github.addRepo({ name: "shelf" });
    existing.files.set("SPEC.md", renderSpecMarkdown({ ...spec, name: "Other" }));
    const events = await run({ ...request, resume: true });
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ step: "repo", code: "not_resumable" }) as unknown,
      },
    ]);
  });

  it("reports not_found when the repo to resume has gone", async () => {
    const events = await run({ ...request, resume: true });
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ step: "repo", code: "not_found" }) as unknown,
      },
    ]);
  });

  it("maps a failed commit and an expired token to their steps and codes", async () => {
    github.failOn("createTree", { status: 401 });
    const events = await run(request);
    expect(events.at(-1)).toEqual({
      type: "error",
      error: expect.objectContaining({
        step: "commit",
        code: "unauthorized",
        retryable: false,
      }) as unknown,
    });
  });

  it("reports a primary rate limit as rate_limited", async () => {
    github.failOn("createLabel", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    const events = await run(request);
    expect(events.at(-1)).toEqual({
      type: "error",
      error: expect.objectContaining({
        step: "labels",
        code: "rate_limited",
        retryable: true,
      }) as unknown,
    });
  });
});

describe("runCreate: deadline", () => {
  it("pauses before the deadline and carries on when sent again", async () => {
    let clock = 0;
    const now = () => (clock += 10);
    const first = await run(request, { deadlineMs: 25, now });
    expect(first.at(-1)).toEqual({ type: "paused" });
    const created = first.filter((event) => event.type === "issue").length;
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThan(4);

    const second = await run({ ...request, resume: true });
    expect(second.at(-1)).toEqual({ type: "complete" });
    expect(repo().issues).toHaveLength(4);
  });
});
