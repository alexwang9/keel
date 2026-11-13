import { webCookies } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";
import { completeSignIn, type CallbackDeps, type CallbackFailure } from "@/lib/auth/callback";
import { callbackUrl, deleteGrant, exchangeCode, fetchUser, oauthClient } from "@/lib/auth/github";
import { takeOAuthState, writeSession } from "@/lib/auth/session";
import { getEnv, type Env } from "@/lib/env";
import { logError, logWarn } from "@/lib/log";

const FAILURE_REDIRECTS: Record<CallbackFailure["reason"], string> = {
  cancelled: "/?error=cancelled",
  stateMismatch: "/?error=signin",
  exchangeFailed: "/?error=signin",
  userFailed: "/?error=signin",
  notAllowed: "/private-preview",
};

function logFailure(failure: CallbackFailure): void {
  if (failure.reason === "exchangeFailed" || failure.reason === "userFailed") {
    logError(`auth.${failure.reason}`, failure.cause);
  } else if (failure.reason === "notAllowed") {
    logWarn("auth.not_allowed", { login: failure.login });
  } else {
    logWarn(`auth.${failure.reason}`);
  }
}

function callbackDeps(env: Env): CallbackDeps {
  const client = oauthClient(env);
  return {
    exchangeCode: (code, codeVerifier) =>
      exchangeCode(client, { code, codeVerifier, redirectUrl: callbackUrl(env) }),
    fetchUser,
    discardToken: async (token) => {
      const result = await deleteGrant(client, token);
      if (!result.ok) logError("auth.delete_grant_failed", result.error);
    },
    isAllowed: (login) => isAllowed(login, env.ALLOWED_GITHUB_LOGINS),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const env = getEnv();
  const params = request.nextUrl.searchParams;
  // Cookie writes collect here, then go on whichever redirect we return.
  const headers = new Headers();
  const jar = webCookies(request, headers);

  const stored = await takeOAuthState(jar);
  const result = await completeSignIn(
    { code: params.get("code"), state: params.get("state"), error: params.get("error") },
    stored,
    callbackDeps(env),
  );

  if (!result.ok) {
    logFailure(result.error);
    return NextResponse.redirect(new URL(FAILURE_REDIRECTS[result.error.reason], env.APP_URL), {
      headers,
    });
  }

  await writeSession(jar, result.value);
  return NextResponse.redirect(new URL("/app", env.APP_URL), { headers });
}
