import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { githubErrorCode } from "@/lib/github/errors";
import { fetchRepoGraph } from "@/lib/github/graph";
import { formatRepoRef, parseRepoRef } from "@/lib/github/repo-ref";
import { logError } from "@/lib/log";

const problem = (status: number, error: string, errors?: string[]): Response =>
  NextResponse.json({ error, ...(errors ? { errors } : {}) }, { status });

const statusFor = (code: string): number => {
  if (code === "unauthorized") return 401;
  if (code === "not_found") return 404;
  return 502;
};

/** `GET /api/github/graph?repo=owner/name`: the dependency graph of a repo's Keel issues. */
export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const session = await readSession(webCookies(request, new Headers()));
  if (!session || !isAllowed(session.login, env.ALLOWED_GITHUB_LOGINS)) {
    return problem(401, "unauthorized");
  }

  const ref = parseRepoRef(new URL(request.url).searchParams.get("repo") ?? "");
  if (!ref.ok) return problem(400, "invalid_request", [ref.error]);

  try {
    const graph = await fetchRepoGraph(createGitHubClient(session.token), ref.value);
    if (!graph) return problem(404, "not_found");
    return NextResponse.json(graph, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = githubErrorCode(error);
    logError("github.graph_failed", error, { code, repo: formatRepoRef(ref.value) });
    return problem(statusFor(code), code);
  }
}
