import { describe, expect, it } from "vitest";
import { bullet, bullets, document, normalize, oneLine } from "@/lib/markdown";

describe("markdown helpers", () => {
  it("normalizes line endings and trims", () => {
    expect(normalize("  a\r\nb\rc  ")).toBe("a\nb\nc");
  });

  it("collapses text onto one line", () => {
    expect(oneLine("a \n  b\r\nc")).toBe("a b c");
  });

  it("indents continuation lines of a bullet", () => {
    expect(bullet("a\nb")).toBe("- a\n  b");
  });

  it("renders an empty list as a placeholder", () => {
    expect(bullets([])).toBe("None.");
    expect(bullets(["a", "b"])).toBe("- a\n- b");
  });

  it("joins blocks with blank lines and one trailing newline", () => {
    expect(document(["# A", "b"])).toBe("# A\n\nb\n");
  });
});
