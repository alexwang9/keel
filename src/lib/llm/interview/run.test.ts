import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "@/lib/llm/client";
import type { InterviewEvent } from "@/lib/llm/interview/events";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { runInterview, type InterviewInput } from "@/lib/llm/interview/run";
import type { SpecDraft } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";
import {
  anthropicMessages,
  reply,
  textBlock,
  thinkingBlock,
  toolUseBlock,
  type FixtureReply,
} from "@/test/msw/anthropic";
import { server } from "@/test/msw/server";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const opening: HistoryMessage[] = [{ role: "user", content: "I want an app for my book club." }];
const setName = { ops: [{ op: "set", field: "name", value: "Shelf" }] };

async function run(
  replies: FixtureReply[],
  input: Partial<InterviewInput> = {},
  signal?: AbortSignal,
) {
  const api = anthropicMessages(replies);
  server.use(api.handler);
  // Built per test, after MSW has patched fetch: the SDK captures `fetch` when constructed.
  const client = createAnthropicClient({ ANTHROPIC_API_KEY: "sk-ant-test" });
  const events: InterviewEvent[] = [];
  const full = { history: opening, draft: {} satisfies SpecDraft, ...input };
  for await (const event of runInterview(client, full, signal)) events.push(event);
  return { events, requests: api.requests };
}

const ofType = <T extends InterviewEvent["type"]>(events: InterviewEvent[], type: T) =>
  events.filter((event): event is Extract<InterviewEvent, { type: T }> => event.type === type);

const text = (events: InterviewEvent[]) =>
  ofType(events, "text")
    .map((event) => event.text)
    .join("");

describe("runInterview: request", () => {
  it("sends the configured model, the tools, caching and the refusal fallback", async () => {
    const { requests } = await run([reply([textBlock("Hi")])]);
    const [request] = requests;
    const body = request?.body ?? {};

    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      stream: true,
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      messages: opening,
    });
    expect(body.system).toEqual([
      expect.objectContaining({ type: "text", cache_control: { type: "ephemeral" } }),
    ]);
    expect(
      (body.tools as { name: string; strict?: boolean }[]).map((t) => [t.name, t.strict ?? false]),
    ).toEqual([
      ["update_spec", false],
      ["finish_interview", true],
    ]);
    expect(request?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });
});

describe("runInterview: replies and tools", () => {
  it("streams a text reply and commits it as one turn", async () => {
    const { events } = await run([reply([thinkingBlock(), textBlock("What is the app called?")])]);

    expect(text(events)).toBe("What is the app called?");
    expect(ofType(events, "turn")).toEqual([
      {
        type: "turn",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "", signature: "EqQBCkYIBhgCKkBfakesignature" },
              { type: "text", text: "What is the app called?" },
            ],
          },
        ],
      },
    ]);
    expect(events.at(-1)?.type).toBe("turn");
  });

  it("applies an update_spec patch, then continues with the tool result appended", async () => {
    const { events, requests } = await run([
      reply([toolUseBlock("toolu_1", "update_spec", setName)], "tool_use"),
      reply([textBlock("Who is it for?")]),
    ]);

    expect(ofType(events, "specPatch")).toEqual([
      { type: "specPatch", ops: setName.ops, draft: { name: "Shelf" } },
    ]);
    const [first, second] = ofType(events, "turn");
    expect(first?.messages).toHaveLength(2);
    expect(first?.messages[1]).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1" }],
    });
    expect(second?.messages).toHaveLength(1);
    expect(text(events)).toBe("Who is it for?");

    // Append-only: the second call resends the original history unchanged, plus the new turn.
    const sent = requests[1]?.body.messages as unknown[];
    expect(sent.slice(0, opening.length)).toEqual(opening);
    expect(sent.slice(opening.length)).toEqual(first?.messages);
  });

  it("rejects invalid tool input with an error result and leaves the draft alone", async () => {
    const badOps = { ops: [{ op: "upsert", list: "features", item: { id: "F1" } }] };
    const { events, requests } = await run([
      reply([toolUseBlock("toolu_1", "update_spec", badOps)], "tool_use"),
      reply([textBlock("Let me fix that.")]),
    ]);

    expect(ofType(events, "specPatch")).toEqual([]);
    const toolResult = (requests[1]?.body.messages as HistoryMessage[]).at(-1);
    expect(toolResult?.content).toEqual([
      expect.objectContaining({ tool_use_id: "toolu_1", is_error: true }),
    ]);
  });

  it("rejects a premature finish_interview and keeps the interview going", async () => {
    const { events, requests } = await run([
      reply([toolUseBlock("toolu_1", "finish_interview", {})], "tool_use"),
      reply([textBlock("What problem does it solve?")]),
    ]);

    expect(ofType(events, "complete")).toEqual([]);
    const toolResult = (requests[1]?.body.messages as HistoryMessage[]).at(-1);
    expect(toolResult?.content).toEqual([
      expect.objectContaining({
        is_error: true,
        content: expect.stringContaining("- problem") as string,
      }),
    ]);
    expect(text(events)).toBe("What problem does it solve?");
  });

  it("accepts finish_interview on a complete draft and stops without another call", async () => {
    const { events, requests } = await run(
      [reply([textBlock("Done."), toolUseBlock("toolu_1", "finish_interview", {})], "tool_use")],
      { draft: completeDraft },
    );

    expect(requests).toHaveLength(1);
    expect(events.map((event) => event.type).slice(-2)).toEqual(["turn", "complete"]);
    expect(ofType(events, "complete")[0]?.spec.name).toBe(completeDraft.name);
  });

  it("judges a finish against updates made in the same response", async () => {
    const nameless: SpecDraft = { ...completeDraft };
    delete nameless.name;
    const { events, requests } = await run(
      [
        reply(
          [
            toolUseBlock("toolu_2", "finish_interview", {}),
            toolUseBlock("toolu_1", "update_spec", setName),
          ],
          "tool_use",
        ),
      ],
      { draft: nameless },
    );

    expect(requests).toHaveLength(1);
    expect(ofType(events, "complete")[0]?.spec.name).toBe("Shelf");
    // Results keep the order of the calls.
    const results = ofType(events, "turn")[0]?.messages[1]?.content as { tool_use_id: string }[];
    expect(results.map((result) => result.tool_use_id)).toEqual(["toolu_2", "toolu_1"]);
  });

  it("stops with loop_limit when the model keeps calling tools", async () => {
    const looping = Array.from({ length: 5 }, (_, index) =>
      reply([toolUseBlock(`toolu_${String(index)}`, "update_spec", setName)], "tool_use"),
    );
    const { events, requests } = await run(looping);

    expect(requests).toHaveLength(5);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "loop_limit" } });
  });
});

describe("runInterview: refusals and truncation", () => {
  it("maps a refusal to an error and runs none of its tools", async () => {
    const { events } = await run([
      reply([textBlock("I can"), toolUseBlock("toolu_1", "update_spec", setName)], "refusal", {
        stopDetails: { type: "refusal", category: "cyber", explanation: "x" },
      }),
    ]);

    expect(ofType(events, "specPatch")).toEqual([]);
    expect(ofType(events, "turn")).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: { code: "refusal", retryable: false },
    });
  });

  it("maps max_tokens to an error without committing the partial turn", async () => {
    const { events } = await run([reply([textBlock("Half a sent")], "max_tokens")]);
    expect(ofType(events, "turn")).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "max_tokens" } });
  });

  it("keeps only text from before a mid-output fallback, and runs only the tools after it", async () => {
    const { events } = await run([
      reply(
        [
          thinkingBlock("declined"),
          textBlock("Sure, "),
          toolUseBlock("toolu_1", "update_spec", {
            ops: [{ op: "set", field: "name", value: "X" }],
          }),
          {
            type: "fallback",
            from: { model: "claude-sonnet-5-5" },
            to: { model: "claude-opus-4-8" },
          },
          textBlock("what is it called?"),
        ],
        "end_turn",
        { model: "claude-opus-4-8" },
      ),
    ]);

    expect(ofType(events, "specPatch")).toEqual([]);
    const content = ofType(events, "turn")[0]?.messages[0]?.content as { type: string }[];
    expect(content.map((block) => block.type)).toEqual(["text", "fallback", "text"]);
  });
});

describe("runInterview: API errors", () => {
  it.each([
    [429, "rate_limit_error", "rate_limited", true],
    [529, "overloaded_error", "overloaded", true],
    [400, "invalid_request_error", "bad_request", false],
    [401, "authentication_error", "server_config", false],
  ] as const)("maps HTTP %i to %s", async (status, errorType, code, retryable) => {
    const { events } = await run([{ kind: "httpError", status, errorType }]);
    expect(events).toEqual([
      { type: "error", error: expect.objectContaining({ code, retryable }) as unknown },
    ]);
  });

  it("maps a mid-stream error and leaves the streamed text uncommitted", async () => {
    const { events } = await run([
      {
        kind: "midStreamError",
        content: [textBlock("Partial reply")],
        errorType: "overloaded_error",
      },
    ]);
    expect(ofType(events, "turn")).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "overloaded" } });
  });

  it("logs the failure with its request id", async () => {
    const log = vi.mocked(console.error);
    log.mockClear();
    await run([{ kind: "httpError", status: 429, errorType: "rate_limit_error" }]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req_fixture"'));
  });

  it("stops quietly when the client has gone away", async () => {
    const controller = new AbortController();
    controller.abort();
    const { events } = await run([reply([textBlock("Hi")])], {}, controller.signal);
    expect(events).toEqual([]);
  });
});
