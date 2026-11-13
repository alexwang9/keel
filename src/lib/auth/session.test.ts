import { webCookies } from "iron-session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { getSessionUser, isSecureCookie, readSession, writeSession } from "@/lib/auth/session";
import { cookieHeader, setCookie } from "@/test/cookies";
import { stubTestEnv } from "@/test/fixtures/env";

// Server components read cookies through `next/headers`; give them the request's cookies.
const requestCookies = vi.hoisted(() => ({ header: "" }));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const pair = requestCookies.header.split("; ").find((c) => c.startsWith(`${name}=`));
        return pair ? { name, value: pair.slice(name.length + 1) } : undefined;
      },
      set: () => undefined,
    }),
}));

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const data = {
  token: "gho_secret",
  login: "octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/1",
};

async function written(): Promise<Response> {
  const response = new Response();
  await writeSession(webCookies(new Request("http://localhost"), response), data);
  return response;
}

const readFrom = (cookie: string) =>
  readSession(webCookies(new Request("http://localhost", { headers: { cookie } }), new Headers()));

describe("session cookie", () => {
  it("round-trips sealed data in a 7-day httpOnly, SameSite=Lax cookie", async () => {
    const response = await written();
    const header = setCookie(response, SESSION_COOKIE) ?? "";

    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/Max-Age=604740/i);
    expect(header).not.toContain("gho_secret");
    expect(await readFrom(cookieHeader(response))).toEqual(data);
  });

  it("treats a tampered or missing cookie as signed out", async () => {
    const cookie = cookieHeader(await written());

    expect(await readFrom(`${cookie.slice(0, -4)}AAAA`)).toBeNull();
    expect(await readFrom(`${SESSION_COOKIE}=not-a-seal`)).toBeNull();
    expect(await readFrom("")).toBeNull();
  });
});

describe("getSessionUser", () => {
  it("gives UI code the login and avatar but never the token", async () => {
    requestCookies.header = cookieHeader(await written());

    const user = await getSessionUser();

    expect(user).toEqual({ login: data.login, avatarUrl: data.avatarUrl });
    expect(JSON.stringify(user)).not.toContain("gho_secret");
  });

  it("is null when signed out", async () => {
    requestCookies.header = "";

    expect(await getSessionUser()).toBeNull();
  });
});

describe("isSecureCookie", () => {
  it("is off only for plain-HTTP outside production", () => {
    expect(isSecureCookie({ NODE_ENV: "development", APP_URL: "http://localhost:3000" })).toBe(
      false,
    );
    expect(isSecureCookie({ NODE_ENV: "development", APP_URL: "https://keel.dev" })).toBe(true);
    expect(isSecureCookie({ NODE_ENV: "production", APP_URL: "http://localhost:3000" })).toBe(true);
  });
});
