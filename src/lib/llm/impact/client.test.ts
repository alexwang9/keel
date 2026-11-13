// @vitest-environment jsdom
// jsdom gives fetch a page origin, so the client's relative URL resolves.
import { describe, expect, it } from "vitest";
import { checkImpact, type ImpactCheckEvent } from "@/lib/llm/impact/client";
import type { ImpactEvent } from "@/lib/llm/impact/events";
import { SpecSchema } from "@/lib/spec/schema";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";
import { completeDraft } from "@/test/fixtures/spec";
import { events, sseApi, type SseReply } from "@/test/msw/sse-routes";

const input = {
  spec: SpecSchema.parse(completeDraft),
  checked: checkedTickets,
  tickets: editedTickets,
};

const impactApi = (replies: SseReply<ImpactEvent>[]) => sseApi("/api/tickets/impact", replies);

async function collect(): Promise<ImpactCheckEvent[]> {
  const out: ImpactCheckEvent[] = [];
  for await (const event of checkImpact(input)) out.push(event);
  return out;
}

const invalid: ImpactEvent = { type: "invalid", output: '{"ops":[]}', errors: ["T4 → T3"] };
const complete: ImpactEvent = { type: "complete", ops: fixOps };

describe("checkImpact", () => {
  it("posts the spec and both lists, then yields the proposal", async () => {
    const api = impactApi([events<ImpactEvent>({ type: "started" }, complete)]);
    expect(await collect()).toEqual([{ type: "started" }, complete]);
    expect(api.bodies).toEqual([JSON.parse(JSON.stringify(input))]);
  });

  it("sends one repair request after an invalid proposal", async () => {
    const api = impactApi([events(invalid), events(complete)]);
    expect(await collect()).toEqual([{ type: "repairing", errors: 1 }, complete]);
    expect(api.bodies[1]).toMatchObject({ repair: { output: '{"ops":[]}', errors: ["T4 → T3"] } });
  });

  it("uses impact-check copy for client failures", async () => {
    impactApi([{ kind: "status", status: 400 }]);
    expect((await collect()).at(-1)).toEqual({
      type: "error",
      error: {
        code: "invalid_request",
        message: expect.stringContaining("impact check") as unknown,
        retryable: false,
      },
    });
  });

  it("passes on a server error", async () => {
    const failed: ImpactEvent = {
      type: "error",
      error: { code: "rate_limited", message: "Wait.", retryable: true },
    };
    impactApi([events(failed)]);
    expect(await collect()).toEqual([failed]);
  });
});
