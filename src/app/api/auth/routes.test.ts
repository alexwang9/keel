import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/api/auth/callback/route";
import { GET as fakeAuthorize } from "@/app/api/auth/fake-authorize/route";
import { GET as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { OAUTH_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookies";
import { codeChallenge } from "@/lib/auth/pkce";
import { readSession } from "@/lib/auth/session";
import { webCookies } from "iron-session";
import { cookieHeader, isCleared, setCookie } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { FAKE_AVATAR, FAKE_TOKEN, githubOAuth } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  stubTestEnv();
  // Failures are logged on purpose in several tests; keep the output clean.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const APP = testEnv.APP_URL;

interface StartedSignIn {
  authorizeUrl: URL;
  cookie: string;
}

async function startSignIn(): Promise<StartedSignIn> {
  const response = await login(new Request(`${APP}/api/auth/login`));
  return {
    authorizeUrl: new URL(response.headers.get("location") ?? ""),
    cookie: cookieHeader(response),
  };
}

function callbackRequest(query: Record<string, string>, cookie = ""): NextRequest {
  const url = new URL("/api/auth/callback", APP);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url, { headers: { cookie } });
}

async function signInWith(options: Parameters<typeof githubOAuth>[0] = {}) {
  const github = githubOAuth(options);
  server.use(...github.handlers);
  const started = await startSignIn();
  const state = started.authorizeUrl.searchParams.get("state") ?? "";
  const response = await callback(callbackRequest({ code: "the-code", state }, started.cookie));
  return { response, calls: github.calls, started };
}

async function everythingVisible(response: Response): Promise<string> {
  const headers = [...response.headers.entries()]
    .filter(([name]) => name !== "set-cookie")
    .map(([name, value]) => `${name}: ${value}`);
  return [...headers, await response.clone().text()].join("\n");
}

describe("GET /api/auth/login", () => {
  it("redirects to GitHub with public_repo scope, a random state and an S256 challenge", async () => {
    const first = await startSignIn();
    const second = await startSignIn();
    const params = first.authorizeUrl.searchParams;

    expect(first.authorizeUrl.origin + first.authorizeUrl.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(params.get("client_id")).toBe(testEnv.GITHUB_CLIENT_ID);
    expect(params.get("scope")).toBe("public_repo");
    expect(params.get("redirect_uri")).toBe(`${APP}/api/auth/callback`);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(params.get("state")).toMatch(/^[\w-]{43}$/);
    expect(second.authorizeUrl.searchParams.get("state")).not.toBe(params.get("state"));
  });

  it("stores the state in a short-lived, httpOnly, sealed cookie", async () => {
    const response = await login(new Request(`${APP}/api/auth/login`));
    const header = setCookie(response, OAUTH_COOKIE) ?? "";
    const state = new URL(response.headers.get("location") ?? "").searchParams.get("state") ?? "";

    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Max-Age=540/i);
    expect(header).not.toContain(state);
  });
});

describe("GET /api/auth/callback", () => {
  it("signs an allowlisted user in, sending the PKCE verifier that matches the challenge", async () => {
    const { response, calls, started } = await signInWith();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${APP}/app`);
    const [exchange] = calls.exchanges;
    expect(exchange).toMatchObject({ client_id: testEnv.GITHUB_CLIENT_ID, code: "the-code" });
    expect(codeChallenge(String(exchange?.code_verifier))).toBe(
      started.authorizeUrl.searchParams.get("code_challenge"),
    );

    const session = await readSession(
      webCookies(new Request(APP, { headers: { cookie: cookieHeader(response) } }), new Headers()),
    );
    expect(session).toEqual({ token: FAKE_TOKEN, login: "octocat", avatarUrl: FAKE_AVATAR });
    expect(isCleared(setCookie(response, OAUTH_COOKIE))).toBe(true);
    expect(calls.grantDeletions).toEqual([]);
  });

  it("never exposes the token in headers, body or readable cookie text", async () => {
    const { response } = await signInWith();

    expect(await everythingVisible(response)).not.toContain(FAKE_TOKEN);
    expect(setCookie(response, SESSION_COOKIE)).toBeDefined();
    expect(response.headers.getSetCookie().join("\n")).not.toContain(FAKE_TOKEN);
  });

  it("rejects a state that doesn't match the cookie", async () => {
    const github = githubOAuth();
    server.use(...github.handlers);
    const started = await startSignIn();

    const response = await callback(
      callbackRequest({ code: "the-code", state: "forged" }, started.cookie),
    );

    expect(response.headers.get("location")).toBe(`${APP}/?error=signin`);
    expect(setCookie(response, SESSION_COOKIE)).toBeUndefined();
    expect(github.calls.exchanges).toEqual([]);
  });

  it("rejects a callback with no sign-in in progress", async () => {
    const response = await callback(callbackRequest({ code: "the-code", state: "anything" }));

    expect(response.headers.get("location")).toBe(`${APP}/?error=signin`);
    expect(setCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  it("explains a cancelled authorization", async () => {
    const started = await startSignIn();
    const response = await callback(
      callbackRequest({ error: "access_denied", state: "x" }, started.cookie),
    );

    expect(response.headers.get("location")).toBe(`${APP}/?error=cancelled`);
  });

  it("shows a friendly error when GitHub rejects the code with HTTP 200", async () => {
    const { response, calls } = await signInWith({ exchangeError: "bad_verification_code" });

    expect(response.headers.get("location")).toBe(`${APP}/?error=signin`);
    expect(setCookie(response, SESSION_COOKIE)).toBeUndefined();
    expect(calls.grantDeletions).toEqual([]);
  });

  it("refuses a non-allowlisted user, creates no session and deletes the grant", async () => {
    const { response, calls } = await signInWith({ login: "stranger" });

    expect(response.headers.get("location")).toBe(`${APP}/private-preview`);
    expect(setCookie(response, SESSION_COOKIE)).toBeUndefined();
    expect(await everythingVisible(response)).not.toContain(FAKE_TOKEN);

    const basic = `basic ${btoa(`${testEnv.GITHUB_CLIENT_ID}:${testEnv.GITHUB_CLIENT_SECRET}`)}`;
    expect(calls.grantDeletions).toEqual([
      { authorization: basic, body: { access_token: FAKE_TOKEN } },
    ]);
  });

  it("matches the allowlist case-insensitively", async () => {
    const { response } = await signInWith({ login: "OctoCat" });

    expect(response.headers.get("location")).toBe(`${APP}/app`);
  });

  it("still shows the private-preview page when deleting the grant fails", async () => {
    const { response, calls } = await signInWith({ login: "stranger", grantDeletionStatus: 500 });

    expect(calls.grantDeletions.length).toBeGreaterThan(0);
    expect(response.headers.get("location")).toBe(`${APP}/private-preview`);
    expect(setCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  it("logs failures without the token or client secret", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await signInWith({ login: "stranger", grantDeletionStatus: 500 });

    const logged = errors.mock.calls.flat().join("\n");
    expect(logged).toContain("auth.delete_grant_failed");
    expect(logged).not.toContain(FAKE_TOKEN);
    expect(logged).not.toContain(testEnv.GITHUB_CLIENT_SECRET);
  });
});

describe("GET /api/auth/fake-authorize", () => {
  it("doesn't exist unless KEEL_FAKE_EXTERNALS is on", () => {
    const response = fakeAuthorize(new NextRequest(`${APP}/api/auth/fake-authorize?state=x`));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and sends the user home with a GET", async () => {
    const { response: signedIn } = await signInWith();

    const response = await logout(
      new Request(`${APP}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: cookieHeader(signedIn) },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP}/`);
    expect(isCleared(setCookie(response, SESSION_COOKIE))).toBe(true);
  });
});
