import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createAnthropicClient } from "@/lib/llm/client";
import { MAX_INTERVIEW_BODY_BYTES, parseInterviewRequest } from "@/lib/llm/interview/request";
import { runInterview } from "@/lib/llm/interview/run";
import { SSE_HEADERS, sseStream } from "@/lib/sse";

// A turn can make several model calls (tool loop); give it room beyond the platform default.
export const maxDuration = 300;

const problem = (status: number, error: string, errors?: string[]): Response =>
  NextResponse.json({ error, ...(errors ? { errors } : {}) }, { status });

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const session = await readSession(webCookies(request, new Headers()));
  // Re-check the allowlist: this route spends the owner's API key, and the list may have changed.
  if (!session || !isAllowed(session.login, env.ALLOWED_GITHUB_LOGINS)) {
    return problem(401, "unauthorized");
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_INTERVIEW_BODY_BYTES) return problem(413, "too_large");

  const parsed = parseInterviewRequest(await request.text());
  if (!parsed.ok) {
    const { status, errors } = parsed.error;
    return problem(status, status === 413 ? "too_large" : "invalid_request", errors);
  }

  const events = runInterview(createAnthropicClient(env), parsed.value, request.signal);
  return new Response(sseStream(events), { headers: SSE_HEADERS });
}
