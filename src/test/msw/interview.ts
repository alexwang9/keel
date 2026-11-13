import { http, HttpResponse } from "msw";
import type { InterviewEvent } from "@/lib/llm/interview/events";
import { sseFrame } from "@/lib/sse";
import { server } from "@/test/msw/server";

export type InterviewReply =
  | { kind: "events"; events: InterviewEvent[]; chunkSize?: number }
  // Raw SSE text, for malformed or truncated streams.
  | { kind: "raw"; body: string }
  | { kind: "status"; status: number };

export const events = (...list: InterviewEvent[]): InterviewReply => ({
  kind: "events",
  events: list,
});

const encoder = new TextEncoder();

/** Splits the body into fixed-size chunks, so events straddle chunk boundaries. */
function chunkedStream(body: string, chunkSize: number): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(body);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function respond(next: InterviewReply): Response {
  if (next.kind === "status") return HttpResponse.json({ error: "x" }, { status: next.status });
  const body = next.kind === "raw" ? next.body : next.events.map(sseFrame).join("");
  const chunkSize = next.kind === "events" ? (next.chunkSize ?? body.length) : body.length;
  return new HttpResponse(chunkedStream(body, Math.max(chunkSize, 1)), {
    headers: { "content-type": "text/event-stream" },
  });
}

/**
 * Scripts `POST /api/interview`: each request takes the next reply. Records each request body,
 * so tests can check what the browser sent.
 */
export function interviewApi(replies: InterviewReply[]): { bodies: unknown[] } {
  const bodies: unknown[] = [];
  const queue = [...replies];
  server.use(
    http.post("*/api/interview", async ({ request }) => {
      bodies.push(await request.json());
      const next = queue.shift();
      if (!next) throw new Error("interviewApi: no reply scripted for this request");
      return respond(next);
    }),
  );
  return { bodies };
}
