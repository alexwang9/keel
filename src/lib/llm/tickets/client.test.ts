// @vitest-environment jsdom
// jsdom gives fetch a page origin, so the client's relative URL resolves.
import { describe, expect, it } from "vitest";
import { generateTickets, type GenerationEvent } from "@/lib/llm/tickets/client";
import type { TicketEvent } from "@/lib/llm/tickets/events";
import { SpecSchema } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets } from "@/test/fixtures/tickets";
import { events, sseApi, type SseReply } from "@/test/msw/sse-routes";

const spec = SpecSchema.parse(completeDraft);
const PATH = "/api/tickets/generate";

const ticketApi = (replies: SseReply<TicketEvent>[]) => sseApi(PATH, replies);

async function collect(signal?: AbortSignal): Promise<GenerationEvent[]> {
  const out: GenerationEvent[] = [];
  for await (const event of generateTickets(spec, signal)) out.push(event);
  return out;
}

const errorCode = (list: GenerationEvent[]): string | undefined => {
  const last = list.at(-1);
  return last?.type === "error" ? last.error.code : undefined;
};

const invalid: TicketEvent = { type: "invalid", output: '{"tickets":[]}', errors: ["cycle"] };
const complete: TicketEvent = { type: "complete", tickets: shelfTickets };

describe("generateTickets", () => {
  it("posts the spec and yields validated progress, then the tickets", async () => {
    const api = ticketApi([
      {
        kind: "events",
        chunkSize: 9,
        events: [{ type: "started" }, { type: "drafting", count: 2 }, complete],
      },
    ]);

    const list = await collect();

    expect(api.bodies).toEqual([{ spec }]);
    expect(list).toEqual([{ type: "started" }, { type: "drafting", count: 2 }, complete]);
  });

  it("sends one repair request after an invalid output", async () => {
    const api = ticketApi([events<TicketEvent>({ type: "started" }, invalid), events(complete)]);

    const list = await collect();

    expect(api.bodies).toEqual([
      { spec },
      { spec, repair: { output: '{"tickets":[]}', errors: ["cycle"] } },
    ]);
    expect(list).toEqual([{ type: "started" }, { type: "repairing", errors: 1 }, complete]);
  });

  it("passes on the server's error when the repair fails too", async () => {
    const failed: TicketEvent = {
      type: "error",
      error: { code: "invalid_output", message: "Couldn't fix.", retryable: true },
    };
    ticketApi([events(invalid), events(failed)]);
    expect(errorCode(await collect())).toBe("invalid_output");
  });

  it("refuses to repair a repair", async () => {
    const api = ticketApi([events(invalid), events(invalid)]);
    const list = await collect();
    expect(api.bodies).toHaveLength(2);
    expect(errorCode(list)).toBe("protocol");
  });

  it.each([
    [401, "signed_out"],
    [400, "invalid_request"],
    [413, "too_large"],
    [500, "unknown"],
  ])("maps HTTP %i to %s", async (status, code) => {
    ticketApi([{ kind: "status", status }]);
    expect(errorCode(await collect())).toBe(code);
  });

  it("reports a stream that ends before an outcome", async () => {
    ticketApi([events({ type: "started" }, { type: "validating" })]);
    expect(errorCode(await collect())).toBe("protocol");
  });

  it("reports a malformed event", async () => {
    ticketApi([{ kind: "raw", body: 'data: {"type":"complete","tickets":"nope"}\n\n' }]);
    expect(errorCode(await collect())).toBe("protocol");
  });

  it("ends quietly when aborted before the request", async () => {
    const controller = new AbortController();
    controller.abort();
    ticketApi([events(complete)]);
    expect(await collect(controller.signal)).toEqual([]);
  });
});
