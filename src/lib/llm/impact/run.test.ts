import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "@/lib/llm/client";
import type { ImpactEvent } from "@/lib/llm/impact/events";
import { IMPACT_SYSTEM_PROMPT } from "@/lib/llm/impact/prompt";
import type { ImpactRequest } from "@/lib/llm/impact/request";
import { runImpactCheck, type ImpactOptions } from "@/lib/llm/impact/run";
import type { Repair } from "@/lib/llm/repair";
import { SpecSchema } from "@/lib/spec/schema";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";
import { completeDraft } from "@/test/fixtures/spec";
import {
  anthropicMessages,
  reply,
  textBlock,
  thinkingBlock,
  type FixtureBlock,
  type FixtureReply,
} from "@/test/msw/anthropic";
import { server } from "@/test/msw/server";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const spec = SpecSchema.parse(completeDraft);
const json = (ops: unknown): FixtureBlock => textBlock(JSON.stringify({ ops }));
const unknownOp = [{ op: "deleteTicket", id: "T9", reason: "gone" }];

interface RunInput {
  repair?: Repair;
  signal?: AbortSignal;
  options?: ImpactOptions;
}

async function run(replies: FixtureReply[], { repair, signal, options }: RunInput = {}) {
  const api = anthropicMessages(replies);
  server.use(api.handler);
  // Built per test, after MSW has patched fetch: the SDK captures `fetch` when constructed.
  const client = createAnthropicClient({ ANTHROPIC_API_KEY: "sk-ant-test" });
  const input: ImpactRequest = {
    spec,
    checked: checkedTickets,
    tickets: editedTickets,
    ...(repair ? { repair } : {}),
  };
  const events: ImpactEvent[] = [];
  for await (const event of runImpactCheck(client, input, signal, options)) events.push(event);
  return { events, requests: api.requests };
}

const last = (events: ImpactEvent[]) => events.at(-1);

describe("runImpactCheck: request", () => {
  it("sends Opus at medium effort with structured output and the cached system prompt", async () => {
    const { requests } = await run([reply([json(fixOps)])]);
    const body = requests[0]?.body ?? {};

    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema" } },
      fallbacks: "default",
      system: [{ type: "text", text: IMPACT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('Deleted T3 "Book status".');
    expect(requests[0]?.headers.get("anthropic-beta")).toContain("server-side-fallback");
  });

  it("sends a repair as the failed output plus its errors", async () => {
    const repair = { output: '{"ops":[]}', errors: ["T4 depends on unknown T3"] };
    const { requests } = await run([reply([json(fixOps)])], { repair });
    const messages = requests[0]?.body.messages as { role: string; content: string }[];

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1]?.content).toBe(repair.output);
    expect(messages[2]?.content).toContain("- T4 depends on unknown T3");
  });
});

describe("runImpactCheck: outcomes", () => {
  it("streams progress, then the proposal", async () => {
    const { events } = await run([reply([thinkingBlock("weighing"), json(fixOps)])]);
    expect(events).toEqual([
      { type: "started" },
      { type: "thinking" },
      { type: "validating" },
      { type: "complete", ops: fixOps },
    ]);
  });

  it("hands an invalid first proposal back for repair", async () => {
    const { events } = await run([reply([json(unknownOp)])]);
    expect(last(events)).toEqual({
      type: "invalid",
      output: JSON.stringify({ ops: unknownOp }),
      errors: ["ops.0 no ticket with id T9"],
    });
  });

  it("repairs an invalid proposal into a valid one", async () => {
    const repair = { output: JSON.stringify({ ops: unknownOp }), errors: ["no ticket T9"] };
    const { events } = await run([reply([json(fixOps)])], { repair });
    expect(last(events)).toEqual({ type: "complete", ops: fixOps });
  });

  it("fails with invalid_output when the repair is invalid too", async () => {
    const repair = { output: JSON.stringify({ ops: unknownOp }), errors: ["no ticket T9"] };
    const { events } = await run([reply([json(unknownOp)])], { repair });
    expect(last(events)).toMatchObject({ type: "error", error: { code: "invalid_output" } });
  });

  it("reports a refusal without validating", async () => {
    const { events } = await run([reply([], "refusal")]);
    expect(events.map((e) => e.type)).not.toContain("validating");
    expect(last(events)).toMatchObject({ type: "error", error: { code: "refusal" } });
  });

  it("maps API errors to typed codes", async () => {
    const { events } = await run([
      { kind: "httpError", status: 529, errorType: "overloaded_error" },
    ]);
    expect(last(events)).toMatchObject({ type: "error", error: { code: "overloaded" } });
  });

  it("stops at the deadline and reports a timeout", async () => {
    const { events } = await run([{ kind: "stall" }], { options: { deadlineMs: 50 } });
    expect(last(events)).toMatchObject({ type: "error", error: { code: "timeout" } });
  });
});
