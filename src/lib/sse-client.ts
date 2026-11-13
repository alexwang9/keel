import { EventSourceParserStream, type EventSourceMessage } from "eventsource-parser/stream";
import type { z } from "zod";

function parseEvent<S extends z.ZodType>(
  message: EventSourceMessage,
  schema: S,
): z.infer<S> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(message.data));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON: treated like any other malformed event by the caller.
    return null;
  }
}

/**
 * Reads an SSE body in the browser and yields each event validated against `schema`, or `null`
 * for a malformed one (callers stop there). Buffering is capped at `maxBufferSize` characters;
 * a larger event throws. The reader is released however the caller stops.
 */
export async function* readSseEvents<S extends z.ZodType>(
  body: ReadableStream<Uint8Array>,
  schema: S,
  maxBufferSize: number,
): AsyncGenerator<z.infer<S> | null> {
  const reader = body
    // It accepts any BufferSource; TS's lib types can't see that this covers Uint8Array.
    .pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
    .pipeThrough(new EventSourceParserStream({ maxBufferSize }))
    .getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield parseEvent(value, schema);
    }
  } finally {
    // Cancelling an already-finished reader can reject; there is nothing left to clean up then.
    await reader.cancel().catch(() => undefined);
  }
}

/** True when a fetch or read failed because the caller aborted it. */
export const isAbort = (error: unknown, signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");

/** POSTs JSON to a same-origin route. Network failures come back as `null`, aborts rethrow. */
export async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return null;
  }
}
