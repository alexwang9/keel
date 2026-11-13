import { http, HttpResponse } from "msw";
import type { InterviewEvent } from "@/lib/llm/interview/events";
import { sseFrame, type SseEvent } from "@/lib/sse";
import { server } from "@/test/msw/server";

/** One scripted reply from a Keel SSE route. */
export type SseReply<E extends SseEvent = SseEvent> =
  // `gate`, when set, holds the response until it resolves.
  | { kind: "events"; events: E[]; chunkSize?: number; gate?: Promise<void> }
  // Raw SSE text, for malformed or truncated streams.
  | { kind: "raw"; body: string }
  | { kind: "status"; status: number };

export type InterviewReply = SseReply<InterviewEvent>;

export const events = <E extends SseEvent>(...list: E[]): SseReply<E> => ({
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

function respond(next: SseReply): Response {
  if (next.kind === "status") return HttpResponse.json({ error: "x" }, { status: next.status });
  const body = next.kind === "raw" ? next.body : next.events.map(sseFrame).join("");
  const chunkSize = next.kind === "events" ? (next.chunkSize ?? body.length) : body.length;
  return new HttpResponse(chunkedStream(body, Math.max(chunkSize, 1)), {
    headers: { "content-type": "text/event-stream" },
  });
}

/**
 * Scripts `POST` requests to a Keel SSE route: each request takes the next reply. Records each
 * request body, so tests can check what the browser sent.
 */
export function sseApi(path: string, replies: SseReply[]): { bodies: unknown[] } {
  const bodies: unknown[] = [];
  const queue = [...replies];
  server.use(
    http.post(`*${path}`, async ({ request }) => {
      bodies.push(await request.json());
      const next = queue.shift();
      if (!next) throw new Error(`sseApi: no reply scripted for request to ${path}`);
      if (next.kind === "events" && next.gate) await next.gate;
      return respond(next);
    }),
  );
  return { bodies };
}

/** Scripts `POST /api/interview`. */
export const interviewApi = (replies: InterviewReply[]): { bodies: unknown[] } =>
  sseApi("/api/interview", replies);
