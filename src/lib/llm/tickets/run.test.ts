import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "@/lib/llm/client";
import type { Repair, TicketEvent } from "@/lib/llm/tickets/events";
import { TICKET_SYSTEM_PROMPT } from "@/lib/llm/tickets/prompt";
import { runTicketGeneration, type GenerationOptions } from "@/lib/llm/tickets/run";
import { renderSpecMarkdown } from "@/lib/spec/render";
import { SpecSchema } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";
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
const json = (tickets: unknown): FixtureBlock => textBlock(JSON.stringify({ tickets }));
const cyclic = [ticket("T1", ["T2"]), ticket("T2", ["T1"])];

interface RunInput {
  repair?: Repair;
  signal?: AbortSignal;
  options?: GenerationOptions;
}

async function run(replies: FixtureReply[], { repair, signal, options }: RunInput = {}) {
  const api = anthropicMessages(replies);
  server.use(api.handler);
  // Built per test, after MSW has patched fetch: the SDK captures `fetch` when constructed.
  const client = createAnthropicClient({ ANTHROPIC_API_KEY: "sk-ant-test" });
  const events: TicketEvent[] = [];
  const input = { spec, ...(repair ? { repair } : {}) };
  for await (const event of runTicketGeneration(client, input, signal, options)) {
    events.push(event);
  }
  return { events, requests: api.requests };
}

const last = (events: TicketEvent[]) => events.at(-1);

describe("runTicketGeneration: request", () => {
  it("sends Opus with structured output, cached system prompt and the rendered spec", async () => {
    const { requests } = await run([reply([json(shelfTickets)])]);
    const body = requests[0]?.body ?? {};

    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
      fallbacks: "default",
      system: [{ type: "text", text: TICKET_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: renderSpecMarkdown(spec) }],
    });
    expect(body).not.toHaveProperty("tools");
    expect(requests[0]?.headers.get("anthropic-beta")).toContain("server-side-fallback");
  });

  it("sends a repair as the failed output plus its errors", async () => {
    const repair = { output: '{"tickets":[]}', errors: ["T1 depends on itself"] };
    const { requests } = await run([reply([json(shelfTickets)])], { repair });
    const messages = requests[0]?.body.messages as { role: string; content: string }[];

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1]?.content).toBe(repair.output);
    expect(messages[2]?.content).toContain("- T1 depends on itself");
  });
});

describe("runTicketGeneration: success", () => {
  it("streams progress, then the tickets in topological order", async () => {
    const reversed = [...shelfTickets].reverse();
    const { events } = await run([reply([thinkingBlock("planning"), json(reversed)])]);
    const types = events.map((event) => event.type);

    expect(types[0]).toBe("started");
    expect(types).toContain("thinking");
    expect(types.slice(-2)).toEqual(["validating", "complete"]);
    const drafting = events.flatMap((e) => (e.type === "drafting" ? [e.count] : []));
    expect(drafting.at(-1)).toBe(4);
    // Ties keep input position, so reversed T2 and T3 stay reversed.
    const tickets = last(events)?.type === "complete" ? (last(events) as { tickets: { id: string }[] }).tickets : [];
    expect(tickets.map((t) => t.id)).toEqual(["T1", "T3", "T2", "T4"]);
  });

  it("uses only the answer after a refusal fallback", async () => {
    const fallback: FixtureBlock = {
      type: "fallback",
      from: { model: "claude-opus-5-5" },
      to: { model: "claude-opus-4-8" },
    };
    const { events } = await run([reply([textBlock('{"tick'), fallback, json(shelfTickets)])]);
    expect(last(events)).toEqual({ type: "complete", tickets: shelfTickets });
  });
});

describe("runTicketGeneration: invalid output", () => {
  it("hands a cyclic first attempt back for repair, with the cycle named", async () => {
    const { events } = await run([reply([json(cyclic)])]);
    const event = last(events);

    expect(event?.type).toBe("invalid");
    if (event?.type !== "invalid") return;
    expect(event.output).toBe(JSON.stringify({ tickets: cyclic }));
    expect(event.errors.join("\n")).toMatch(/cycle.*T1.*T2/i);
  });

  it("repairs a cyclic output into a valid one", async () => {
    const repair = { output: JSON.stringify({ tickets: cyclic }), errors: ["cycle T1 → T2 → T1"] };
    const { events } = await run([reply([json(shelfTickets)])], { repair });
    expect(last(events)).toEqual({ type: "complete", tickets: shelfTickets });
  });

  it("fails with invalid_output when the repair is invalid too", async () => {
    const repair = { output: JSON.stringify({ tickets: cyclic }), errors: ["cycle T1 → T2 → T1"] };
    const { events } = await run([reply([json(cyclic)])], { repair });
    expect(last(events)).toMatchObject({
      type: "error",
      error: { code: "invalid_output", retryable: true },
    });
  });

  it("fails without a repair when there is no output to repair", async () => {
    const { events } = await run([reply([thinkingBlock()])]);
    expect(last(events)).toMatchObject({ type: "error", error: { code: "invalid_output" } });
  });
});

describe("runTicketGeneration: failures", () => {
  it("reports a refusal without validating", async () => {
    const { events } = await run([reply([], "refusal", { stopDetails: { category: "cyber" } })]);
    expect(events.map((e) => e.type)).not.toContain("validating");
    expect(last(events)).toMatchObject({ type: "error", error: { code: "refusal" } });
  });

  it("reports a cut-off output as max_tokens", async () => {
    const { events } = await run([reply([textBlock('{"tickets":[')], "max_tokens")]);
    expect(last(events)).toMatchObject({ type: "error", error: { code: "max_tokens" } });
  });

  it("maps API errors to typed codes", async () => {
    const { events } = await run([
      { kind: "httpError", status: 429, errorType: "rate_limit_error" },
    ]);
    expect(events).toEqual([
      { type: "started" },
      { type: "error", error: expect.objectContaining({ code: "rate_limited" }) as unknown },
    ]);
  });

  it("maps a mid-stream error", async () => {
    const { events } = await run([
      { kind: "midStreamError", content: [textBlock("{")], errorType: "overloaded_error" },
    ]);
    expect(last(events)).toMatchObject({ type: "error", error: { code: "overloaded" } });
  });

  it("stops at the deadline and reports a timeout", async () => {
    const { events } = await run([{ kind: "stall" }], { options: { deadlineMs: 50 } });
    expect(last(events)).toMatchObject({
      type: "error",
      error: { code: "timeout", retryable: true },
    });
  });

  it("ends quietly when the caller aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 30);
    const { events } = await run([{ kind: "stall" }], { signal: controller.signal });
    expect(events).toEqual([{ type: "started" }]);
  });
});
