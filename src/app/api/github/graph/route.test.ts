import { webCookies } from "iron-session";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/github/graph/route";
import { writeSession } from "@/lib/auth/session";
import { MAX_GRAPH_ISSUES } from "@/lib/github/graph";
import { RepoGraphSchema } from "@/lib/graph/schema";
import { renderIssueBody } from "@/lib/tickets/issue-body";
import { cookieHeader } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { shelfTickets } from "@/test/fixtures/tickets";
import { fakeGitHub, type FakeGitHub, type FakeRepo } from "@/test/msw/github";
import { FAKE_AVATAR, FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

vi.mock("@/lib/github/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/client")>();
  return {
    ...actual,
    createGitHubClient: (token: string) =>
      actual.createGitHubClient(token, { throttle: false, retries: 0 }),
  };
});

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

let github: FakeGitHub;
beforeEach(() => {
  github = fakeGitHub();
  server.use(...github.handlers);
});

async function sessionCookie(login = "octocat"): Promise<string> {
  const response = new Response();
  await writeSession(webCookies(new Request(testEnv.APP_URL), response.headers), {
    token: FAKE_TOKEN,
    login,
    avatarUrl: FAKE_AVATAR,
  });
  return cookieHeader(response);
}

const graphRequest = (repo: string, cookie = ""): Request =>
  new Request(`${testEnv.APP_URL}/api/github/graph?repo=${encodeURIComponent(repo)}`, {
    headers: { cookie },
  });

/** The Shelf tickets as issues #1–#4, the way creation leaves them. */
function shelfRepo(): FakeRepo {
  const repo = github.addRepo({ name: "shelf" });
  const numbers = new Map<string, number>();
  for (const ticket of shelfTickets) {
    const number = repo.issues.length + 1;
    const body = renderIssueBody(ticket, numbers);
    if (!body.ok) throw new Error(body.error);
    repo.issues.push({
      number,
      title: ticket.title,
      body: body.value,
      labels: [`size:${ticket.size}`, "status:backlog"],
    });
    numbers.set(ticket.id, number);
  }
  return repo;
}

describe("GET /api/github/graph", () => {
  it("rejects a request without a session, or from a login off the allowlist", async () => {
    expect((await GET(graphRequest("octocat/shelf"))).status).toBe(401);
    expect((await GET(graphRequest("octocat/shelf", await sessionCookie("mallory")))).status).toBe(
      401,
    );
    expect(github.calls).toEqual([]);
  });

  it("builds the graph from the repo's issues", async () => {
    const repo = shelfRepo();
    repo.issues.push({ number: 5, title: "A bug", body: "Broken.", labels: ["bug"] });
    repo.issues.push({
      number: 6,
      title: "A PR",
      body: "Depends on #1",
      labels: [],
      pullRequest: true,
    });
    const [first] = repo.issues;
    if (first) first.state = "closed";

    const response = await GET(
      graphRequest("https://github.com/octocat/shelf", await sessionCookie()),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const graph = RepoGraphSchema.parse(await response.json());
    expect(graph.repo).toEqual({
      fullName: "octocat/shelf",
      htmlUrl: "https://github.com/octocat/shelf",
    });
    expect(graph.nodes.map((node) => [node.number, node.ticketId, node.size, node.state])).toEqual([
      [1, "T1", "M", "closed"],
      [2, "T2", "S", "open"],
      [3, "T3", "S", "open"],
      [4, "T4", expect.any(String), "open"],
    ]);
    expect(graph.nodes[1]?.url).toBe("https://github.com/octocat/shelf/issues/2");
    expect(graph.edges).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 3, to: 4 },
    ]);
    expect(graph.warnings).toEqual([]);
  });

  it("reflects dependencies edited on GitHub", async () => {
    const repo = shelfRepo();
    const fourth = repo.issues[3];
    if (fourth) fourth.body = fourth.body?.replace("Depends on #2", "Depends on #99") ?? null;

    const graph = RepoGraphSchema.parse(
      await (await GET(graphRequest("octocat/shelf", await sessionCookie()))).json(),
    );
    expect(graph.edges).not.toContainEqual({ from: 2, to: 4 });
    expect(graph.warnings).toEqual([{ kind: "unknownDependency", issue: 4, dependency: 99 }]);
  });

  it("reads another owner's public repo", async () => {
    github.addRepo({ owner: "someone", name: "tool" });
    const response = await GET(graphRequest("someone/tool", await sessionCookie()));
    expect(await response.json()).toMatchObject({ nodes: [], edges: [], warnings: [] });
  });

  it("answers an empty graph when the repo has issues turned off", async () => {
    github.addRepo({ name: "shelf" });
    github.failOn("listIssues", { status: 410 });
    const response = await GET(graphRequest("octocat/shelf", await sessionCookie()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ nodes: [], edges: [] });
  });

  it("stops at the issue limit and says so", async () => {
    const repo = github.addRepo({ name: "busy" });
    for (let number = 1; number <= MAX_GRAPH_ISSUES + 1; number += 1) {
      repo.issues.push({
        number,
        title: `#${String(number)}`,
        body: null,
        labels: ["status:backlog"],
      });
    }
    const graph = RepoGraphSchema.parse(
      await (await GET(graphRequest("octocat/busy", await sessionCookie()))).json(),
    );
    expect(graph.nodes).toHaveLength(MAX_GRAPH_ISSUES);
    expect(graph.warnings.at(-1)).toEqual({ kind: "truncated", limit: MAX_GRAPH_ISSUES });
  });

  it("rejects a malformed repo without calling GitHub", async () => {
    const response = await GET(graphRequest("not a repo", await sessionCookie()));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(github.calls).toEqual([]);
  });

  it("answers 404 for a missing or private repo", async () => {
    github.addRepo({ name: "secret", private: true });
    for (const repo of ["octocat/missing", "octocat/secret"]) {
      const response = await GET(graphRequest(repo, await sessionCookie()));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });

  it("maps GitHub failures to typed errors", async () => {
    shelfRepo();
    github.failOn("listIssues", {
      status: 403,
      times: 1,
      headers: { "x-ratelimit-remaining": "0" },
    });
    const limited = await GET(graphRequest("octocat/shelf", await sessionCookie()));
    expect(limited.status).toBe(502);
    expect(await limited.json()).toEqual({ error: "rate_limited" });

    github.failOn("getRepo", { status: 401 });
    const expired = await GET(graphRequest("octocat/shelf", await sessionCookie()));
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ error: "unauthorized" });
  });

  it("never puts the token in a response", async () => {
    shelfRepo();
    const response = await GET(graphRequest("octocat/shelf", await sessionCookie()));
    expect(await response.text()).not.toContain(FAKE_TOKEN);
  });
});
