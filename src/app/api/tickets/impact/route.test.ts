import { webCookies } from "iron-session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tickets/impact/route";
import { writeSession } from "@/lib/auth/session";
import { ImpactEventSchema, type ImpactEvent } from "@/lib/llm/impact/events";
import { SpecSchema } from "@/lib/spec/schema";
import { cookieHeader } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";
import { completeDraft } from "@/test/fixtures/spec";
import { anthropicMessages, reply, textBlock } from "@/test/msw/anthropic";
import { FAKE_AVATAR, FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const URL_ = `${testEnv.APP_URL}/api/tickets/impact`;
const spec = SpecSchema.parse(completeDraft);
const body = { spec, checked: checkedTickets, tickets: editedTickets };

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
    body: JSON.stringify(payload),
  });
}

/** Parses an SSE body into events, validating each against the shared event schema. */
function parseEvents(text: string): ImpactEvent[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.trim() !== "")
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      return ImpactEventSchema.parse(JSON.parse(data?.slice("data: ".length) ?? "null"));
    });
}

describe("POST /api/tickets/impact: access", () => {
  it("rejects a request without a session", async () => {
    const response = await POST(post(body));
    expect(response.status).toBe(401);
  });

  it("rejects a session whose login is no longer on the allowlist", async () => {
    const response = await POST(post(body, await sessionCookie("mallory")));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/tickets/impact: validation", () => {
  it("refuses a check when nothing was edited", async () => {
    const unchanged = { spec, checked: checkedTickets, tickets: checkedTickets };
    const response = await POST(post(unchanged, await sessionCookie()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      errors: ["tickets there are no edits to check"],
    });
  });

  it("rejects malformed tickets", async () => {
    const response = await POST(post({ ...body, tickets: [{ id: "X" }] }, await sessionCookie()));
    expect(response.status).toBe(400);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const response = await POST(post(body, await sessionCookie(), { "content-length": "9999999" }));
    expect(response.status).toBe(413);
  });
});

describe("POST /api/tickets/impact: streaming", () => {
  it("streams schema-valid events ending in the proposal, without the token", async () => {
    const api = anthropicMessages([reply([textBlock(JSON.stringify({ ops: fixOps }))])]);
    server.use(api.handler);

    const response = await POST(post(body, await sessionCookie()));
    const text = await response.text();

    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(parseEvents(text).at(-1)).toEqual({ type: "complete", ops: fixOps });
    expect(text).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(api.requests[0]?.body)).not.toContain(FAKE_TOKEN);
  });
});
