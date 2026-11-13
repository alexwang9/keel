import { describe, expect, it } from "vitest";
import { isAllowed } from "@/lib/auth/allowlist";

describe("isAllowed", () => {
  const allowlist = ["octocat", "hubot-2"];

  it("accepts listed logins in any case", () => {
    expect(isAllowed("octocat", allowlist)).toBe(true);
    expect(isAllowed("Hubot-2", allowlist)).toBe(true);
  });

  it("rejects everything else, including prefixes", () => {
    expect(isAllowed("stranger", allowlist)).toBe(false);
    expect(isAllowed("octo", allowlist)).toBe(false);
    expect(isAllowed("", allowlist)).toBe(false);
  });
});
