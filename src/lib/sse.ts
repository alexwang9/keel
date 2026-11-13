const encoder = new TextEncoder();

/** Any JSON payload with a `type`, which becomes the SSE event name. */
export type SseEvent = { readonly type: string; readonly [key: string]: unknown };

/** One SSE frame. The event name repeats the payload's `type` so clients can use either. */
export const sseFrame = (event: SseEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

/**
 * Streams events as Server-Sent Events. Pulls lazily, so a slow client applies backpressure, and
 * closes the source generator when the client goes away.
 */
export function sseStream(events: AsyncGenerator<SseEvent>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(controller) {
      const next = await events.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(sseFrame(next.value)));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
}

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  // Stops proxies such as nginx from buffering the stream.
  "x-accel-buffering": "no",
} as const;
