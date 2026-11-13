import { describe, expect, it } from "vitest";
import { codeChallenge, randomToken, safeEqual } from "@/lib/auth/pkce";

describe("randomToken", () => {
  it("returns 32 random bytes as base64url, different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, randomToken));

    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
  });
});

describe("codeChallenge", () => {
  it("matches the S256 example from RFC 7636 appendix B", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("safeEqual", () => {
  it("compares strings, including different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
