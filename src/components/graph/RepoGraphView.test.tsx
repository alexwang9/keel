import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { toFlow } from "@/components/graph/DependencyGraph";
import { warningText } from "@/components/graph/GraphWarnings";
import { RepoGraphView } from "@/components/graph/RepoGraphView";
import type { RepoGraph } from "@/lib/graph/schema";
import { server } from "@/test/msw/server";
import { stubReactFlowDom } from "@/test/react-flow";

beforeAll(stubReactFlowDom);

const htmlUrl = "https://github.com/octocat/shelf";
const node = (number: number, overrides: Partial<RepoGraph["nodes"][number]> = {}) => ({
  number,
  title: `Issue ${String(number)}`,
  url: `${htmlUrl}/issues/${String(number)}`,
  size: "M" as const,
  state: "open" as const,
  ticketId: `T${String(number)}`,
  ...overrides,
});

const graph: RepoGraph = {
  repo: { fullName: "octocat/shelf", htmlUrl },
  nodes: [node(1, { state: "closed", size: "S" }), node(2), node(3, { size: null })],
  edges: [
    { from: 1, to: 2 },
    { from: 1, to: 3 },
  ],
  warnings: [{ kind: "unknownDependency", issue: 3, dependency: 99 }],
};

/** Answers graph requests in order (the last reply repeats) and records the repos asked for. */
function graphApi(...replies: { status: number; body: unknown }[]): string[] {
  const asked: string[] = [];
  server.use(
    http.get("*/api/github/graph", ({ request }) => {
      asked.push(new URL(request.url).searchParams.get("repo") ?? "");
      const reply = replies[Math.min(asked.length, replies.length) - 1];
      return HttpResponse.json(reply?.body ?? null, { status: reply?.status ?? 500 });
    }),
  );
  return asked;
}

const repo = { owner: "octocat", name: "shelf" };

describe("RepoGraphView", () => {
  it("loads the repo's graph and links each node to its issue", async () => {
    const asked = graphApi({ status: 200, body: graph });
    render(<RepoGraphView repo={repo} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the dependency graph");

    const figure = await screen.findByRole("figure", { name: "Dependency graph" });
    expect(asked).toEqual(["octocat/shelf"]);
    expect(within(figure).getByRole("link", { name: "#1: Issue 1 (closed)" })).toHaveAttribute(
      "href",
      `${htmlUrl}/issues/1`,
    );
    const second = within(figure).getByRole("link", { name: "#2: Issue 2" });
    expect(second).toHaveTextContent("M");
    expect(within(figure).getByRole("link", { name: "#3: Issue 3" })).not.toHaveTextContent(
      /\bM\b/,
    );
  });

  it("links to the repo and its issues, unless told not to", async () => {
    graphApi({ status: 200, body: graph });
    const { unmount } = render(<RepoGraphView repo={repo} />);
    expect(await screen.findByRole("link", { name: "Open octocat/shelf" })).toHaveAttribute(
      "href",
      htmlUrl,
    );
    expect(screen.getByRole("link", { name: "View the issues" })).toHaveAttribute(
      "href",
      `${htmlUrl}/issues`,
    );
    unmount();

    render(<RepoGraphView repo={repo} links={false} />);
    await screen.findByRole("figure");
    expect(screen.queryByRole("link", { name: "View the issues" })).toBeNull();
  });

  it("lists what was edited on GitHub", async () => {
    graphApi({ status: 200, body: graph });
    render(<RepoGraphView repo={repo} />);
    const notes = await screen.findByRole("region", { name: "Graph notes" });
    expect(notes).toHaveTextContent("#3 depends on #99, which isn't a Keel issue in this repo");
  });

  it("says when the repo has no Keel issues", async () => {
    graphApi({ status: 200, body: { ...graph, nodes: [], edges: [], warnings: [] } });
    render(<RepoGraphView repo={repo} />);
    expect(await screen.findByText(/No Keel issues in octocat\/shelf yet/)).toBeInTheDocument();
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("explains a missing repo without offering a retry", async () => {
    graphApi({ status: 404, body: { error: "not_found" } });
    render(<RepoGraphView repo={repo} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't find that repo");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Sign in when the session has ended", async () => {
    graphApi({ status: 401, body: { error: "unauthorized" } });
    render(<RepoGraphView repo={repo} />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
  });

  it("retries after a rate limit", async () => {
    const asked = graphApi(
      { status: 502, body: { error: "rate_limited" } },
      { status: 200, body: graph },
    );
    render(<RepoGraphView repo={repo} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("GitHub is limiting requests");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("figure")).toBeInTheDocument();
    expect(asked).toHaveLength(2);
  });

  it("treats a malformed response as a failure", async () => {
    graphApi({ status: 200, body: { nodes: "nope" } });
    render(<RepoGraphView repo={repo} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load the graph");
  });
});

describe("warningText", () => {
  it("describes every kind of warning", () => {
    expect(warningText({ kind: "selfDependency", issue: 2 })).toBe(
      "#2 depends on itself, so that arrow isn't drawn.",
    );
    expect(warningText({ kind: "cycle", path: [1, 3, 1] })).toMatch(/^#1 → #3 → #1 depend on/);
    expect(warningText({ kind: "notKeel", issue: 5 })).toMatch(/wasn't created by Keel/);
    expect(warningText({ kind: "truncated", limit: 1000 })).toMatch(/oldest 1,000/);
  });
});

describe("toFlow", () => {
  it("draws an arrow from each dependency down to its dependent", () => {
    const flow = toFlow(graph);
    expect(flow.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["1", "2"],
      ["1", "3"],
    ]);
    const y = (id: string): number => flow.nodes.find((n) => n.id === id)?.position.y ?? NaN;
    expect(y("1")).toBeLessThan(y("2"));
    expect(flow.nodes.map((n) => n.type)).toEqual(["issue", "issue", "issue"]);
  });
});
