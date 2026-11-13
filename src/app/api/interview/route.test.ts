import { webCookies } from "iron-session";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/interview/route";
import { writeSession } from "@/lib/auth/session";
import { InterviewEventSchema, type InterviewEvent } from "@/lib/llm/interview/events";
import { cookieHeader } from "@/test/cookies";
import { stubTestEnv, testEnv } from "@/test/fixtures/env";
import { anthropicMessages, reply, textBlock, toolUseBlock } from "@/test/msw/anthropic";
import { FAKE_AVATAR, FAKE_TOKEN } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

beforeAll(() => {
  stubTestEnv();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const URL_ = `${testEnv.APP_URL}/api/interview`;
const body = { history: [{ role: "user", content: "I want a book club app." }], draft: {} };

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
function parseEvents(text: string): InterviewEvent[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.trim() !== "")
    .map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      return InterviewEventSchema.parse(JSON.parse(data?.slice("data: ".length) ?? "null"));
    });
}

describe("POST /api/interview: access", () => {
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

describe("POST /api/interview: validation", () => {
  it("rejects a body that isn't JSON", async () => {
    const response = await POST(post("{nope", await sessionCookie()));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an invalid body and says which fields are wrong", async () => {
    const response = await POST(post({ history: [], draft: {} }, await sessionCookie()));
    expect(response.status).toBe(400);
    const json = (await response.json()) as { errors: string[] };
    expect(json.errors[0]).toMatch(/^history/);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const response = await POST(post(body, await sessionCookie(), { "content-length": "9999999" }));
    expect(response.status).toBe(413);
  });
});

describe("POST /api/interview: streaming", () => {
  it("streams schema-valid SSE events for a turn with a spec update", async () => {
    const api = anthropicMessages([
      reply(
        [
          toolUseBlock("toolu_1", "update_spec", {
            ops: [{ op: "set", field: "name", value: "Shelf" }],
          }),
        ],
        "tool_use",
      ),
      reply([textBlock("Who is it for?")]),
    ]);
    server.use(api.handler);

    const response = await POST(post(body, await sessionCookie()));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const events = parseEvents(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      "specPatch",
      "turn",
      "text",
      "text",
      "turn",
    ]);
    // SDK 1.x sends the API key as a bearer token.
    expect(api.requests[0]?.headers.get("authorization")).toBe(
      `Bearer ${testEnv.ANTHROPIC_API_KEY}`,
    );
  });

  it("streams API failures as an error event", async () => {
    server.use(
      anthropicMessages([{ kind: "httpError", status: 429, errorType: "rate_limit_error" }])
        .handler,
    );

    const response = await POST(post(body, await sessionCookie()));
    const events = parseEvents(await response.text());

    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({ code: "rate_limited", retryable: true }) as unknown,
      },
    ]);
  });

  it("never sends the GitHub token, to the client or to Anthropic", async () => {
    const api = anthropicMessages([reply([textBlock("Hi")])]);
    server.use(api.handler);

    const response = await POST(post(body, await sessionCookie()));
    const visible = [...response.headers.entries(), await response.text()].join("\n");
    const sent = api.requests.map((request) => JSON.stringify(request.body)).join("\n");

    expect(visible).not.toContain(FAKE_TOKEN);
    expect(sent).not.toContain(FAKE_TOKEN);
  });
});
