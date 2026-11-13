// @vitest-environment jsdom
// jsdom gives fetch a page origin, so the client's relative `/api/interview` URL resolves.
import { describe, expect, it } from "vitest";
import { sendTurn, type TurnEvent } from "@/lib/llm/interview/client";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { SpecSchema } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { events, interviewApi } from "@/test/msw/interview";

const history: HistoryMessage[] = [{ role: "user", content: "A book club app." }];
const assistant: HistoryMessage = { role: "assistant", content: [{ type: "text", text: "Hi!" }] };

async function collect(signal?: AbortSignal): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const event of sendTurn({ history, draft: {} }, signal)) out.push(event);
  return out;
}

const errorCode = (list: TurnEvent[]): string | undefined => {
  const last = list.at(-1);
  return last?.type === "error" ? last.error.code : undefined;
};

describe("sendTurn", () => {
  it("posts the history and draft, and yields validated events", async () => {
    const api = interviewApi([
      events(
        { type: "text", text: "Hi" },
        { type: "text", text: "!" },
        { type: "turn", messages: [assistant] },
      ),
    ]);

    const list = await collect();

    expect(api.bodies).toEqual([{ history, draft: {} }]);
    expect(list.map((event) => event.type)).toEqual(["text", "text", "turn"]);
  });

  it("reassembles events split across arbitrary chunk boundaries", async () => {
    const spec = SpecSchema.parse(completeDraft);
    interviewApi([
      {
        kind: "events",
        chunkSize: 7,
        events: [
          { type: "text", text: "Done — ✓ ünïcode" },
          { type: "specPatch", ops: [], draft: completeDraft },
          { type: "turn", messages: [assistant] },
          { type: "complete", spec },
        ],
      },
    ]);

    const list = await collect();

    expect(list[0]).toEqual({ type: "text", text: "Done — ✓ ünïcode" });
    expect(list.map((event) => event.type)).toEqual(["text", "specPatch", "turn", "complete"]);
  });

  it("passes a server error event through and stops", async () => {
    const error = { code: "rate_limited", message: "Slow down.", retryable: true } as const;
    interviewApi([events({ type: "text", text: "Hi" }, { type: "error", error })]);

    const list = await collect();

    expect(list.at(-1)).toEqual({ type: "error", error });
    expect(list).toHaveLength(2);
  });

  it.each([
    [401, "signed_out", false],
    [400, "invalid_request", false],
    [413, "too_large", false],
    [500, "unknown", true],
  ])("maps HTTP %i to %s", async (status, code, retryable) => {
    interviewApi([{ kind: "status", status }]);

    const list = await collect();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: "error", error: { code, retryable } });
  });

  it("reports a stream that ends before the turn commits", async () => {
    interviewApi([events({ type: "text", text: "Hi" })]);

    expect(errorCode(await collect())).toBe("protocol");
  });

  it("reports an empty stream", async () => {
    interviewApi([{ kind: "raw", body: "" }]);

    expect(errorCode(await collect())).toBe("protocol");
  });

  it("stops at an event that fails validation", async () => {
    interviewApi([
      {
        kind: "raw",
        body: 'data: {"type":"text","text":"ok"}\n\ndata: {"type":"turn","messages":"nope"}\n\n',
      },
    ]);

    const list = await collect();

    expect(list.map((event) => event.type)).toEqual(["text", "error"]);
    expect(errorCode(list)).toBe("protocol");
  });

  it("stops at an event that isn't JSON", async () => {
    interviewApi([{ kind: "raw", body: "data: {oops\n\n" }]);

    expect(errorCode(await collect())).toBe("protocol");
  });

  it("ends quietly when aborted before the request", async () => {
    interviewApi([events({ type: "turn", messages: [assistant] })]);
    const controller = new AbortController();
    controller.abort();

    expect(await collect(controller.signal)).toEqual([]);
  });
});
