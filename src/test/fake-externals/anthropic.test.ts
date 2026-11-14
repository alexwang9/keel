import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "@/lib/llm/client";
import type { ImpactEvent } from "@/lib/llm/impact/events";
import { runImpactCheck } from "@/lib/llm/impact/run";
import type { InterviewEvent } from "@/lib/llm/interview/events";
import type { HistoryMessage } from "@/lib/llm/interview/history";
import { runInterview } from "@/lib/llm/interview/run";
import type { TicketEvent } from "@/lib/llm/tickets/events";
import { runTicketGeneration } from "@/lib/llm/tickets/run";
import { SpecSchema, type SpecDraft } from "@/lib/spec/schema";
import { fakeAnthropic } from "@/test/fake-externals/anthropic";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets } from "@/test/fixtures/tickets";
import { server } from "@/test/msw/server";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

// Built per test, after MSW has patched fetch: the SDK captures `fetch` when constructed.
function client() {
  server.use(fakeAnthropic);
  return createAnthropicClient({ ANTHROPIC_API_KEY: "sk-ant-test" });
}

async function collect<E>(events: AsyncIterable<E>): Promise<E[]> {
  const all: E[] = [];
  for await (const event of events) all.push(event);
  return all;
}

interface Turn {
  events: InterviewEvent[];
  history: HistoryMessage[];
  draft: SpecDraft;
}

/** One interview request, then the history and draft the client would store after it. */
async function answer(text: string, history: HistoryMessage[], draft: SpecDraft): Promise<Turn> {
  const sent: HistoryMessage[] = [...history, { role: "user", content: text }];
  const events = await collect(runInterview(client(), { history: sent, draft }));
  const turns = events.flatMap((event) => (event.type === "turn" ? event.messages : []));
  const patched = events.flatMap((event) => (event.type === "specPatch" ? [event.draft] : []));
  return { events, history: [...sent, ...turns], draft: patched.at(-1) ?? draft };
}

const spec = SpecSchema.parse(completeDraft);

describe("fake Anthropic", () => {
  it("fills the spec over two answers, then finishes", async () => {
    const first = await answer("A book club app.", [], {});
    expect(first.events.some((event) => event.type === "complete")).toBe(false);
    expect(first.draft.name).toBe("Shelf");
    expect(first.events.at(-1)).toEqual({ type: "turn", messages: expect.any(Array) as unknown });

    const second = await answer("Vercel, no accounts.", first.history, first.draft);
    expect(second.events.at(-1)).toEqual({ type: "complete", spec });
  });

  it("finishes later answers without patching, so review edits survive", async () => {
    const first = await answer("A book club app.", [], {});
    const second = await answer("Vercel.", first.history, first.draft);
    const edited = { ...second.draft, name: "Shelfie" };
    const third = await answer("Renamed it.", second.history, edited);

    expect(third.events.some((event) => event.type === "specPatch")).toBe(false);
    expect(third.events.at(-1)).toEqual({ type: "complete", spec: { ...spec, name: "Shelfie" } });
  });

  it("generates the Shelf tickets", async () => {
    const events: TicketEvent[] = await collect(runTicketGeneration(client(), { spec }));
    expect(events.at(-1)).toEqual({ type: "complete", tickets: shelfTickets });
  });

  it("answers an impact check with no changes", async () => {
    const tickets = shelfTickets.map((ticket) =>
      ticket.id === "T2" ? { ...ticket, title: "Add a book by title" } : ticket,
    );
    const input = { spec, checked: shelfTickets, tickets };
    const events: ImpactEvent[] = await collect(runImpactCheck(client(), input));
    expect(events.at(-1)).toEqual({ type: "complete", ops: [] });
  });
});
