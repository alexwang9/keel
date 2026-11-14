import { http, HttpResponse, type RequestHandler } from "msw";
import { FAKE_TOKEN } from "@/test/msw/github-oauth";

const API = "https://api.github.com";

export interface FakeIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  /** Defaults to open. */
  state?: "open" | "closed";
  pullRequest?: boolean;
}

export interface FakeRepo {
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  /** Files on the default branch. */
  files: Map<string, string>;
  /** Commit shas on the default branch, oldest first. */
  commits: string[];
  labels: Set<string>;
  /** Issues and pull requests share numbers, as on GitHub. */
  issues: FakeIssue[];
}

/** Routes failures can be injected into. */
export type FakeRoute =
  | "getRepo"
  | "createRepo"
  | "getContent"
  | "getRef"
  | "createTree"
  | "updateRef"
  | "createLabel"
  | "listIssues"
  | "createIssue";

interface Failure {
  status: number;
  /** Let this many calls succeed first. */
  after: number;
  /** Fail this many calls, then succeed again. */
  times: number;
  headers?: Record<string, string>;
}

export interface FakeGitHub {
  handlers: RequestHandler[];
  repos: Map<string, FakeRepo>;
  /** Every call, as `METHOD /path`, in order. */
  calls: string[];
  addRepo: (repo: Partial<FakeRepo> & Pick<FakeRepo, "name">) => FakeRepo;
  failOn: (route: FakeRoute, failure: Partial<Failure> & Pick<Failure, "status">) => void;
  count: (call: string) => number;
}

const key = (owner: string, name: string): string => `${owner}/${name}`.toLowerCase();

const repoJson = (repo: FakeRepo) => ({
  name: repo.name,
  full_name: `${repo.owner}/${repo.name}`,
  html_url: `https://github.com/${repo.owner}/${repo.name}`,
  default_branch: repo.defaultBranch,
  private: repo.private,
  owner: { login: repo.owner },
});

const message = (status: number, text: string, errors?: unknown[]) =>
  HttpResponse.json({ message: text, ...(errors ? { errors } : {}) }, { status });

/**
 * An in-memory GitHub for one user, covering what repo creation calls. Requests without the fake
 * token get a 401. Shas are counters, and a commit just replaces the branch's files.
 */
export function fakeGitHub(login = "octocat"): FakeGitHub {
  const repos = new Map<string, FakeRepo>();
  const calls: string[] = [];
  const failures = new Map<FakeRoute, Failure & { seen: number }>();
  const trees = new Map<string, Map<string, string>>();
  const commitTrees = new Map<string, string>();
  let sha = 0;
  const nextSha = (): string => (sha += 1).toString(16).padStart(40, "0");

  const addRepo: FakeGitHub["addRepo"] = (partial) => {
    const first = nextSha();
    const repo: FakeRepo = {
      owner: login,
      private: false,
      defaultBranch: "main",
      files: new Map([["README.md", `# ${partial.name}\n`]]),
      commits: [first],
      labels: new Set(),
      issues: [],
      ...partial,
    };
    trees.set(first, new Map(repo.files));
    commitTrees.set(first, first);
    repos.set(key(repo.owner, repo.name), repo);
    return repo;
  };

  /** A failure response if `route` should fail on this call. */
  function injected(route: FakeRoute): Response | null {
    const failure = failures.get(route);
    if (!failure) return null;
    failure.seen += 1;
    if (failure.seen <= failure.after || failure.seen > failure.after + failure.times) return null;
    return HttpResponse.json(
      { message: `Injected ${String(failure.status)}` },
      { status: failure.status, headers: failure.headers },
    );
  }

  type Params = Record<string, string | readonly string[] | undefined>;
  type Handler = (args: {
    request: Request;
    params: Params;
    repo: FakeRepo;
  }) => Response | Promise<Response>;

  /** Wraps a repo-scoped handler: auth, call log, injected failures and the repo lookup. */
  const scoped =
    (route: FakeRoute | null, handler: Handler) =>
    async ({ request, params }: { request: Request; params: Params }): Promise<Response> => {
      calls.push(`${request.method} ${decodeURIComponent(new URL(request.url).pathname)}`);
      if (request.headers.get("authorization") !== `token ${FAKE_TOKEN}`) {
        return message(401, "Bad credentials");
      }
      const failure = route ? injected(route) : null;
      if (failure) return failure;
      const repo = repos.get(key(String(params.owner), String(params.repo)));
      // Private repos are invisible to a `public_repo` token.
      if (!repo || repo.private) return message(404, "Not Found");
      return handler({ request, params, repo });
    };

  const handlers: RequestHandler[] = [
    http.post(`${API}/user/repos`, async ({ request }) => {
      calls.push(`POST /user/repos`);
      if (request.headers.get("authorization") !== `token ${FAKE_TOKEN}`) {
        return message(401, "Bad credentials");
      }
      const failure = injected("createRepo");
      if (failure) return failure;
      const body = (await request.json()) as { name: string; auto_init?: boolean };
      if (repos.has(key(login, body.name))) {
        return message(422, "Repository creation failed.", [
          {
            resource: "Repository",
            code: "custom",
            field: "name",
            message: "name already exists on this account",
          },
        ]);
      }
      return HttpResponse.json(repoJson(addRepo({ name: body.name })), { status: 201 });
    }),
    http.get(
      `${API}/repos/:owner/:repo`,
      scoped("getRepo", ({ repo }) => HttpResponse.json(repoJson(repo))),
    ),
    http.get(
      `${API}/repos/:owner/:repo/contents/*`,
      scoped("getContent", ({ request, repo }) => {
        const path = decodeURIComponent(new URL(request.url).pathname.split("/contents/")[1] ?? "");
        const content = repo.files.get(path);
        if (content === undefined) return message(404, "Not Found");
        return HttpResponse.json({
          type: "file",
          path,
          encoding: "base64",
          content: Buffer.from(content, "utf8").toString("base64"),
        });
      }),
    ),
    http.get(
      `${API}/repos/:owner/:repo/commits`,
      scoped(null, ({ request, repo }) => {
        const perPage = Number(new URL(request.url).searchParams.get("per_page") ?? 30);
        const shas = [...repo.commits].reverse().slice(0, perPage);
        return HttpResponse.json(shas.map((commit) => ({ sha: commit })));
      }),
    ),
    http.get(
      `${API}/repos/:owner/:repo/git/ref/*`,
      scoped("getRef", ({ repo }) => HttpResponse.json({ object: { sha: repo.commits.at(-1) } })),
    ),
    http.get(
      `${API}/repos/:owner/:repo/git/commits/:sha`,
      scoped(null, ({ params }) =>
        HttpResponse.json({ sha: params.sha, tree: { sha: commitTrees.get(String(params.sha)) } }),
      ),
    ),
    http.post(
      `${API}/repos/:owner/:repo/git/trees`,
      scoped("createTree", async ({ request }) => {
        const body = (await request.json()) as {
          base_tree: string;
          tree: { path: string; content: string }[];
        };
        const files = new Map(trees.get(body.base_tree));
        for (const entry of body.tree) files.set(entry.path, entry.content);
        const tree = nextSha();
        trees.set(tree, files);
        return HttpResponse.json({ sha: tree }, { status: 201 });
      }),
    ),
    http.post(
      `${API}/repos/:owner/:repo/git/commits`,
      scoped(null, async ({ request }) => {
        const body = (await request.json()) as { tree: string };
        const commit = nextSha();
        commitTrees.set(commit, body.tree);
        return HttpResponse.json({ sha: commit }, { status: 201 });
      }),
    ),
    http.patch(
      `${API}/repos/:owner/:repo/git/refs/*`,
      scoped("updateRef", async ({ request, repo }) => {
        const body = (await request.json()) as { sha: string };
        repo.commits.push(body.sha);
        repo.files = new Map(trees.get(commitTrees.get(body.sha) ?? ""));
        return HttpResponse.json({ object: { sha: body.sha } });
      }),
    ),
    http.post(
      `${API}/repos/:owner/:repo/labels`,
      scoped("createLabel", async ({ request, repo }) => {
        const body = (await request.json()) as { name: string };
        if (repo.labels.has(body.name)) {
          return message(422, "Validation Failed", [
            { resource: "Label", code: "already_exists", field: "name" },
          ]);
        }
        repo.labels.add(body.name);
        return HttpResponse.json({ name: body.name }, { status: 201 });
      }),
    ),
    http.get(
      `${API}/repos/:owner/:repo/issues`,
      scoped("listIssues", ({ request, repo }) => {
        const url = new URL(request.url);
        const perPage = Number(url.searchParams.get("per_page") ?? 30);
        const page = Number(url.searchParams.get("page") ?? 1);
        const slice = repo.issues.slice((page - 1) * perPage, page * perPage);
        const more = page * perPage < repo.issues.length;
        const next = new URL(url);
        next.searchParams.set("page", String(page + 1));
        return HttpResponse.json(
          slice.map((issue) => ({
            number: issue.number,
            title: issue.title,
            html_url: `https://github.com/${repo.owner}/${repo.name}/issues/${String(issue.number)}`,
            state: issue.state ?? "open",
            body: issue.body,
            labels: issue.labels.map((name) => ({ name })),
            ...(issue.pullRequest ? { pull_request: { url: "https://example.test" } } : {}),
          })),
          { headers: more ? { link: `<${next.toString()}>; rel="next"` } : {} },
        );
      }),
    ),
    http.post(
      `${API}/repos/:owner/:repo/issues`,
      scoped("createIssue", async ({ request, repo }) => {
        const body = (await request.json()) as { title: string; body: string; labels: string[] };
        const unknown = body.labels.filter((label) => !repo.labels.has(label));
        if (unknown.length > 0) return message(422, `Unknown labels: ${unknown.join(", ")}`);
        const issue: FakeIssue = {
          number: repo.issues.length + 1,
          title: body.title,
          body: body.body,
          labels: body.labels,
        };
        repo.issues.push(issue);
        return HttpResponse.json(
          { number: issue.number, html_url: "https://example.test" },
          { status: 201 },
        );
      }),
    ),
  ];

  return {
    handlers,
    repos,
    calls,
    addRepo,
    failOn: (route, failure) => {
      failures.set(route, { after: 0, times: Infinity, ...failure, seen: 0 });
    },
    count: (call) => calls.filter((made) => made === call).length,
  };
}
