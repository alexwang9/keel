import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/api/auth/callback/route";
import { GET as fakeAuthorize } from "@/app/api/auth/fake-authorize/route";
import { GET as login } from "@/app/api/auth/login/route";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { cookieHeader, setCookie } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { githubOAuth } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  // `getEnv()` caches per test file, so fake mode gets a file of its own.
  stubTestEnv();
  vi.stubEnv("KEEL_FAKE_EXTERNALS", "1");
});

const APP = testEnv.APP_URL;
const location = (response: Response): URL => new URL(response.headers.get("location") ?? "");

describe("sign-in with KEEL_FAKE_EXTERNALS=1", () => {
  it("sends the browser to the local stand-in instead of github.com", async () => {
    const started = await login(new Request(`${APP}/api/auth/login`));
    const url = location(started);

    expect(url.origin + url.pathname).toBe(`${APP}/api/auth/fake-authorize`);
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{43}$/);
  });

  it("approves at once, and the callback signs in through the faked token exchange", async () => {
    const github = githubOAuth();
    server.use(...github.handlers);
    const started = await login(new Request(`${APP}/api/auth/login`));

    const approved = fakeAuthorize(new NextRequest(location(started)));
    const back = location(approved);
    expect(back.origin + back.pathname).toBe(`${APP}/api/auth/callback`);
    expect(back.searchParams.get("state")).toBe(location(started).searchParams.get("state"));

    const signedIn = await callback(
      new NextRequest(back, { headers: { cookie: cookieHeader(started) } }),
    );
    expect(location(signedIn).pathname).toBe("/app");
    expect(setCookie(signedIn, SESSION_COOKIE)).toBeDefined();
    expect(github.calls.exchanges).toHaveLength(1);
  });
});
