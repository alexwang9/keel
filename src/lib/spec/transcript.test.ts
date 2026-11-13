import { describe, expect, it } from "vitest";
import { TranscriptSchema } from "@/lib/spec/schema";
import { renderTranscriptMarkdown } from "@/lib/spec/transcript";

describe("renderTranscriptMarkdown", () => {
  it("renders each turn under a speaker heading, text verbatim", () => {
    const markdown = renderTranscriptMarkdown([
      { role: "user", text: "I want a book club app." },
      { role: "assistant", text: "Who is it for?\n\n- Members\n- Organisers" },
      { role: "user", text: "Both." },
    ]);

    expect(markdown).toBe(
      [
        "# Interview transcript",
        "",
        "### You",
        "",
        "I want a book club app.",
        "",
        "### Keel",
        "",
        "Who is it for?",
        "",
        "- Members",
        "- Organisers",
        "",
        "### You",
        "",
        "Both.",
        "",
      ].join("\n"),
    );
  });

  it("skips turns with no visible text and normalizes line endings", () => {
    const markdown = renderTranscriptMarkdown([
      { role: "user", text: "Hello\r\nthere  " },
      { role: "assistant", text: "   " },
    ]);

    expect(markdown).toBe("# Interview transcript\n\n### You\n\nHello\nthere\n");
  });

  it("says so when there are no turns", () => {
    expect(renderTranscriptMarkdown([])).toBe("# Interview transcript\n\n_No messages._\n");
  });
});

describe("TranscriptSchema", () => {
  it("rejects unknown roles", () => {
    expect(TranscriptSchema.safeParse([{ role: "system", text: "x" }]).success).toBe(false);
  });
});
