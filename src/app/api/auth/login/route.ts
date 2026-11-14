import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import {
  authorizationUrl,
  callbackUrl,
  fakeAuthorizationUrl,
  oauthClient,
} from "@/lib/auth/github";
import { codeChallenge, randomToken } from "@/lib/auth/pkce";
import { writeOAuthState } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const state = randomToken();
  const codeVerifier = randomToken();

  const headers = new Headers();
  await writeOAuthState(webCookies(request, headers), { state, codeVerifier });

  const url = env.KEEL_FAKE_EXTERNALS
    ? fakeAuthorizationUrl(env, state)
    : authorizationUrl(oauthClient(env), {
        redirectUrl: callbackUrl(env),
        state,
        codeChallenge: codeChallenge(codeVerifier),
      });
  return NextResponse.redirect(url, { headers });
}
