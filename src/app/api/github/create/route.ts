import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { CREATE_DEADLINE_MS, runCreate } from "@/lib/github/create";
import { MAX_CREATE_BODY_BYTES, parseCreateRequest } from "@/lib/github/request";
import { SSE_HEADERS, sseStream } from "@/lib/sse";

// Vercel Hobby's ceiling. A run stops itself with `paused` at `CREATE_DEADLINE_MS`, and the
// client sends the request again to carry on.
export const maxDuration = 300;

const problem = (status: number, error: string, errors?: string[]): Response =>
  NextResponse.json({ error, ...(errors ? { errors } : {}) }, { status });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** `POST /api/github/create`: creates (or resumes) the repo, commit, labels and issues over SSE. */
export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const session = await readSession(webCookies(request, new Headers()));
  if (!session || !isAllowed(session.login, env.ALLOWED_GITHUB_LOGINS)) {
    return problem(401, "unauthorized");
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_CREATE_BODY_BYTES) return problem(413, "too_large");

  const parsed = parseCreateRequest(await request.text());
  if (!parsed.ok) {
    const { status, errors } = parsed.error;
    return problem(status, status === 413 ? "too_large" : "invalid_request", errors);
  }

  const events = runCreate(createGitHubClient(session.token), parsed.value, {
    login: session.login,
    deadlineMs: CREATE_DEADLINE_MS,
    now: Date.now,
    branchWait: { attempts: 5, delayMs: 1_000, sleep },
    signal: request.signal,
  });
  return new Response(sseStream(events), { headers: SSE_HEADERS });
}
