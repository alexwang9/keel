import { webCookies } from "iron-session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tickets/generate/route";
import { writeSession } from "@/lib/auth/session";
import { TicketEventSchema, type TicketEvent } from "@/lib/llm/tickets/events";
import { SpecSchema } from "@/lib/spec/schema";
import { cookieHeader } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets } from "@/test/fixtures/tickets";
import { anthropicMessages, reply, textBlock } from "@/test/msw/anthropic";
import { FAKE_AVATAR, FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const URL_ = `${testEnv.APP_URL}/api/tickets/generate`;
const body = { spec: SpecSchema.parse(completeDraft) };

async function sessionCookie(login = "octocat"): Promise<string> {
  const response = new Response();
  await writeSession(webCookies(new Request(URL_), response.headers), {
    token: FAKE_TOKEN,
    login,
    avatarUrl: FAKE_AVATAR,
  });
  return cookieHeader(response);
}

function post(payload: unknown, cookie = "", headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

/** Parses an SSE body into events, validating each against the shared event schema. */
function parseEvents(text: string): TicketEvent[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.trim() !== "")
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      return TicketEventSchema.parse(JSON.parse(data?.slice("data: ".length) ?? "null"));
    });
}

describe("POST /api/tickets/generate: access", () => {
  it("rejects a request without a session", async () => {
    const response = await POST(post(body));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a session whose login is no longer on the allowlist", async () => {
    const response = await POST(post(body, await sessionCookie("mallory")));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/tickets/generate: validation", () => {
  it("rejects an incomplete spec and says which fields are wrong", async () => {
    const response = await POST(post({ spec: { name: "Shelf" } }, await sessionCookie()));
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string; errors: string[] };
    expect(json.error).toBe("invalid_request");
    expect(json.errors[0]).toMatch(/^spec/);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const response = await POST(post(body, await sessionCookie(), { "content-length": "9999999" }));
    expect(response.status).toBe(413);
  });
});

describe("POST /api/tickets/generate: streaming", () => {
  it("streams schema-valid progress events ending in the tickets", async () => {
    const api = anthropicMessages([reply([textBlock(JSON.stringify({ tickets: shelfTickets }))])]);
    server.use(api.handler);

    const response = await POST(post(body, await sessionCookie()));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const events = parseEvents(await response.text());
    expect(events[0]).toEqual({ type: "started" });
    expect(events.at(-1)).toEqual({ type: "complete", tickets: shelfTickets });
    expect(api.requests).toHaveLength(1);
  });

  it("never sends the GitHub token, to the client or to Anthropic", async () => {
    const api = anthropicMessages([reply([textBlock(JSON.stringify({ tickets: shelfTickets }))])]);
    server.use(api.handler);

    const response = await POST(post(body, await sessionCookie()));
    const visible = [...response.headers.entries(), await response.text()].join("\n");
    const sent = api.requests.map((request) => JSON.stringify(request.body)).join("\n");

    expect(visible).not.toContain(FAKE_TOKEN);
    expect(sent).not.toContain(FAKE_TOKEN);
  });
});
