import { describe, expect, it } from "vitest";
import { sseFrame, sseStream } from "@/lib/sse";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("sseFrame", () => {
  it("names the event after its type and sends it as one JSON data line", () => {
    expect(sseFrame({ type: "text", text: "a\nb" })).toBe(
      'event: text\ndata: {"type":"text","text":"a\\nb"}\n\n',
    );
  });
});

describe("sseStream", () => {
  it("writes one frame per event, then closes", async () => {
    async function* events() {
      await Promise.resolve();
      yield { type: "text", text: "Hi" };
      yield { type: "turn", messages: [] };
    }
    expect(await readAll(sseStream(events()))).toBe(
      sseFrame({ type: "text", text: "Hi" }) + sseFrame({ type: "turn", messages: [] }),
    );
  });

  it("closes the source generator when the reader cancels", async () => {
    let finished = false;
    async function* events() {
      try {
        await Promise.resolve();
        yield { type: "text", text: "1" };
        yield { type: "text", text: "2" };
      } finally {
        finished = true;
      }
    }
    const reader = sseStream(events()).getReader();
    await reader.read();
    await reader.cancel();
    expect(finished).toBe(true);
  });
});
