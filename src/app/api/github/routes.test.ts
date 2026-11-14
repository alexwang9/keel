import { webCookies } from "iron-session";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/github/create/route";
import { GET } from "@/app/api/github/repo-name/route";
import { writeSession } from "@/lib/auth/session";
import { CreateEventSchema, type CreateEvent } from "@/lib/github/events";
import { renderSpecMarkdown } from "@/lib/spec/render";
import { SpecSchema } from "@/lib/spec/schema";
import { cookieHeader } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";
import { fakeGitHub, type FakeGitHub } from "@/test/msw/github";
import { FAKE_AVATAR, FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

// Octokit's write throttling spaces requests seconds apart; the routes' logic doesn't depend on it.
vi.mock("@/lib/github/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/client")>();
  return {
    ...actual,
    createGitHubClient: (token: string) =>
      actual.createGitHubClient(token, { throttle: false, retries: 0 }),
  };
});

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

let github: FakeGitHub;
beforeEach(() => {
  github = fakeGitHub();
  server.use(...github.handlers);
});

const spec = SpecSchema.parse(completeDraft);
const body = {
  repoName: "shelf",
  resume: false,
  spec,
  transcript: [{ role: "user", text: "A reading list." }],
  tickets: shelfTickets,
};

async function sessionCookie(login = "octocat", token = FAKE_TOKEN): Promise<string> {
  const response = new Response();
  await writeSession(webCookies(new Request(testEnv.APP_URL), response.headers), {
    token,
    login,
    avatarUrl: FAKE_AVATAR,
  });
  return cookieHeader(response);
}

const createRequest = (payload: unknown, cookie = ""): Request =>
  new Request(`${testEnv.APP_URL}/api/github/create`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

const nameRequest = (name: string, cookie = ""): Request =>
  new Request(`${testEnv.APP_URL}/api/github/repo-name?name=${encodeURIComponent(name)}`, {
    headers: { cookie },
  });

function parseEvents(text: string): CreateEvent[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.trim() !== "")
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      return CreateEventSchema.parse(JSON.parse(data?.slice("data: ".length) ?? "null"));
    });
}

describe("GitHub routes: access", () => {
  it("reject a request without a session", async () => {
    expect((await POST(createRequest(body))).status).toBe(401);
    expect((await GET(nameRequest("shelf"))).status).toBe(401);
  });

  it("reject a login no longer on the allowlist", async () => {
    const cookie = await sessionCookie("mallory");
    expect((await POST(createRequest(body, cookie))).status).toBe(401);
    expect((await GET(nameRequest("shelf", cookie))).status).toBe(401);
    expect(github.calls).toEqual([]);
  });
});

describe("POST /api/github/create", () => {
  it("streams the whole creation", async () => {
    const response = await POST(createRequest(body, await sessionCookie()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).not.toContain(FAKE_TOKEN);
    const events = parseEvents(text);
    expect(events.filter((event) => event.type === "issue")).toHaveLength(4);
    expect(events.at(-1)).toEqual({ type: "complete" });
  });

  it("rejects tickets with dependency problems before calling GitHub", async () => {
    const cyclic = [ticket("T1", ["T2"]), ticket("T2", ["T1"])];
    const response = await POST(createRequest({ ...body, tickets: cyclic }, await sessionCookie()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      errors: [expect.stringContaining("cycle") as unknown],
    });
    expect(github.calls).toEqual([]);
  });

  it("rejects an invalid repo name, an empty list and an incomplete spec", async () => {
    const cookie = await sessionCookie();
    for (const bad of [
      { ...body, repoName: "my repo" },
      { ...body, tickets: [] },
      { ...body, spec: { ...spec, features: [] } },
    ]) {
      expect((await POST(createRequest(bad, cookie))).status).toBe(400);
    }
  });

  it("reports a revoked token as unauthorized in the stream", async () => {
    const events = parseEvents(
      await (await POST(createRequest(body, await sessionCookie("octocat", "gho_revoked")))).text(),
    );
    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ step: "repo", code: "unauthorized" }) as unknown,
      },
    ]);
  });
});

describe("GET /api/github/repo-name", () => {
  it("says a free name is available", async () => {
    const response = await GET(nameRequest("shelf", await sessionCookie()));
    expect(await response.json()).toEqual({ available: true });
  });

  it("suggests the first free alternative for a taken name", async () => {
    github.addRepo({ name: "shelf" });
    github.addRepo({ name: "shelf-2" });
    const response = await GET(nameRequest("shelf", await sessionCookie()));
    expect(await response.json()).toEqual({ available: false, keel: false, suggestion: "shelf-3" });
  });

  it("recognises a Keel repo by its SPEC.md marker", async () => {
    github.addRepo({ name: "shelf" }).files.set("SPEC.md", renderSpecMarkdown(spec));
    const response = await GET(nameRequest("Shelf", await sessionCookie()));
    expect(await response.json()).toEqual({ available: false, keel: true, suggestion: "Shelf-2" });
  });

  it("gives no suggestion when every alternative is taken", async () => {
    for (const name of ["shelf", "shelf-2", "shelf-3", "shelf-4", "shelf-5", "shelf-6"]) {
      github.addRepo({ name });
    }
    const response = await GET(nameRequest("shelf", await sessionCookie()));
    expect(await response.json()).toEqual({ available: false, keel: false, suggestion: null });
  });

  it("rejects an invalid name without calling GitHub", async () => {
    const response = await GET(nameRequest("my repo", await sessionCookie()));
    expect(response.status).toBe(400);
    expect(github.calls).toEqual([]);
  });

  it("answers 502 when GitHub fails", async () => {
    github.failOn("getRepo", { status: 500 });
    const response = await GET(nameRequest("shelf", await sessionCookie()));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "github_error" });
  });
});
