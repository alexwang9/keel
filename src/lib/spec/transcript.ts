import { document, normalize } from "@/lib/markdown";
import type { TranscriptMessage } from "@/lib/spec/schema";

const SPEAKERS: Record<TranscriptMessage["role"], string> = { user: "You", assistant: "Keel" };

/** Renders the interview as `docs/interview.md`. Turns with no visible text are skipped. */
export function renderTranscriptMarkdown(messages: readonly TranscriptMessage[]): string {
  const turns = messages
    .map((message) => ({ speaker: SPEAKERS[message.role], text: normalize(message.text) }))
    .filter((turn) => turn.text !== "")
    .map((turn) => `### ${turn.speaker}\n\n${turn.text}`);

  return document(["# Interview transcript", ...(turns.length > 0 ? turns : ["_No messages._"])]);
}
