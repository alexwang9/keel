import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { githubErrorCode } from "@/lib/github/errors";
import { checkRepoName } from "@/lib/github/name-check";
import { repoNameProblem } from "@/lib/github/repo-name";
import { logError } from "@/lib/log";

const problem = (status: number, error: string, errors?: string[]): Response =>
  NextResponse.json({ error, ...(errors ? { errors } : {}) }, { status });

/** `GET /api/github/repo-name?name=`: is the name free in the user's account? */
export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const session = await readSession(webCookies(request, new Headers()));
  if (!session || !isAllowed(session.login, env.ALLOWED_GITHUB_LOGINS)) {
    return problem(401, "unauthorized");
  }

  const name = new URL(request.url).searchParams.get("name") ?? "";
  const invalid = repoNameProblem(name);
  if (invalid) return problem(400, "invalid_request", [invalid]);

  try {
    const check = await checkRepoName(createGitHubClient(session.token), session.login, name);
    return NextResponse.json(check);
  } catch (error) {
    const code = githubErrorCode(error);
    logError("github.name_check_failed", error, { code });
    return problem(code === "unauthorized" ? 401 : 502, code);
  }
}
