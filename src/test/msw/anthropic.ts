import { http, HttpResponse, type RequestHandler } from "msw";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export type FixtureBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "fallback"; from: { model: string }; to: { model: string } };

/** One scripted reply from the Messages API. */
export type FixtureReply =
  | {
      kind: "message";
      content: FixtureBlock[];
      stopReason: string;
      stopDetails?: Record<string, unknown>;
      model?: string;
    }
  /** An HTTP error before any streaming, as the API returns it. */
  | { kind: "httpError"; status: number; errorType: string }
  /** Streams the content, then an SSE `error` event instead of finishing. */
  | { kind: "midStreamError"; content: FixtureBlock[]; errorType: string }
  /**
   * Never responds; the request hangs until the client aborts it. (Aborting a mocked body that
   * is already streaming trips an undici assertion under MSW, so this holds back the headers.)
   */
  | { kind: "stall" };

export const reply = (
  content: FixtureBlock[],
  stopReason = "end_turn",
  extra: { stopDetails?: Record<string, unknown>; model?: string } = {},
): FixtureReply => ({ kind: "message", content, stopReason, ...extra });

export const textBlock = (text: string): FixtureBlock => ({ type: "text", text });
export const thinkingBlock = (thinking = ""): FixtureBlock => ({
  type: "thinking",
  thinking,
  signature: "EqQBCkYIBhgCKkBfakesignature",
});
export const toolUseBlock = (
  id: string,
  name: string,
  input: Record<string, unknown>,
): FixtureBlock => ({ type: "tool_use", id, name, input });

const frame = (type: string, data: Record<string, unknown>): string =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

function blockFrames(block: FixtureBlock, index: number): string[] {
  const stop = frame("content_block_stop", { index });
  const delta = (payload: Record<string, unknown>) =>
    frame("content_block_delta", { index, delta: payload });
  switch (block.type) {
    case "text": {
      // Split into two deltas so tests see streaming, not one chunk.
      const middle = Math.ceil(block.text.length / 2);
      return [
        frame("content_block_start", { index, content_block: { type: "text", text: "" } }),
        delta({ type: "text_delta", text: block.text.slice(0, middle) }),
        delta({ type: "text_delta", text: block.text.slice(middle) }),
        stop,
      ];
    }
    case "thinking":
      return [
        frame("content_block_start", {
          index,
          content_block: { type: "thinking", thinking: "", signature: "" },
        }),
        ...(block.thinking ? [delta({ type: "thinking_delta", thinking: block.thinking })] : []),
        delta({ type: "signature_delta", signature: block.signature }),
        stop,
      ];
    case "tool_use":
      return [
        frame("content_block_start", {
          index,
          content_block: { type: "tool_use", id: block.id, name: block.name, input: {} },
        }),
        delta({ type: "input_json_delta", partial_json: JSON.stringify(block.input) }),
        stop,
      ];
    case "fallback":
      return [
        frame("content_block_start", {
          index,
          content_block: { ...block, trigger: { type: "refusal" } },
        }),
        stop,
      ];
  }
}

function startFrame(model: string): string {
  return frame("message_start", {
    message: {
      id: "msg_fixture",
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
}

/** The SSE body the Messages API streams for a reply. */
function streamBody(fixture: Exclude<FixtureReply, { kind: "stall" }>): string {
  if (fixture.kind === "httpError") return "";
  const frames = [
    startFrame(
      fixture.kind === "message" ? (fixture.model ?? "claude-sonnet-5-5") : "claude-sonnet-5-5",
    ),
    ...fixture.content.flatMap(blockFrames),
  ];
  if (fixture.kind === "midStreamError") {
    frames.push(
      `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: fixture.errorType, message: "fixture" } })}\n\n`,
    );
    return frames.join("");
  }
  frames.push(
    frame("message_delta", {
      delta: {
        stop_reason: fixture.stopReason,
        stop_sequence: null,
        stop_details: fixture.stopDetails ?? null,
      },
      usage: { output_tokens: 20 },
    }),
    frame("message_stop", {}),
  );
  return frames.join("");
}

function toResponse(fixture: Exclude<FixtureReply, { kind: "stall" }>): Response {
  // `x-should-retry: false` stops the SDK's automatic retries, so error tests run instantly.
  const headers = { "request-id": "req_fixture", "x-should-retry": "false" };
  if (fixture.kind === "httpError") {
    return HttpResponse.json(
      { type: "error", error: { type: fixture.errorType, message: "fixture" } },
      { status: fixture.status, headers },
    );
  }
  return new HttpResponse(streamBody(fixture), {
    headers: { ...headers, "content-type": "text/event-stream" },
  });
}

export interface RecordedRequest {
  body: Record<string, unknown>;
  headers: Headers;
}

/**
 * An MSW handler for `POST /v1/messages` that plays `replies` in order, one per request, and
 * records every request. A request beyond the script fails the test.
 */
export function anthropicMessages(replies: FixtureReply[]): {
  handler: RequestHandler;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const handler = http.post(MESSAGES_URL, async ({ request }) => {
    requests.push({
      body: (await request.json()) as Record<string, unknown>,
      headers: request.headers,
    });
    const next = replies[requests.length - 1];
    if (!next) throw new Error(`Unscripted Messages API call #${String(requests.length)}`);
    if (next.kind === "stall") {
      await new Promise((resolve) => {
        request.signal.addEventListener("abort", resolve);
      });
      return HttpResponse.error();
    }
    return toResponse(next);
  });
  return { handler, requests };
}
