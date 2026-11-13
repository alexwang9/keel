import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  ANTHROPIC_API_KEY: "sk-ant-test",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "x".repeat(32),
  ALLOWED_GITHUB_LOGINS: "octocat",
};

function errorsFor(overrides: Record<string, string | undefined>): string[] {
  const result = parseEnv({ ...valid, ...overrides });
  if (result.ok) throw new Error("expected parseEnv to fail");
  return result.error;
}

describe("parseEnv", () => {
  it("accepts a complete env and applies defaults", () => {
    const result = parseEnv({ ...valid, NODE_ENV: undefined });

    expect(result).toEqual({
      ok: true,
      value: {
        ...valid,
        NODE_ENV: "development",
        ALLOWED_GITHUB_LOGINS: ["octocat"],
        KEEL_FAKE_EXTERNALS: false,
      },
    });
  });

  it.each(["ANTHROPIC_API_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"])(
    "reports %s when missing or blank",
    (name) => {
      expect(errorsFor({ [name]: undefined })).toEqual([`${name} is required`]);
      expect(errorsFor({ [name]: "   " })).toEqual([`${name} is required`]);
    },
  );

  it("rejects a non-URL APP_URL", () => {
    expect(errorsFor({ APP_URL: "localhost" })).toEqual(["APP_URL must be an absolute URL"]);
  });

  it("rejects a short SESSION_SECRET without echoing it", () => {
    const errors = errorsFor({ SESSION_SECRET: "short-secret-value" });

    expect(errors).toEqual(["SESSION_SECRET must be at least 32 characters"]);
    expect(errors.join()).not.toContain("short-secret-value");
  });

  it("splits, trims and lowercases the allowlist", () => {
    const result = parseEnv({ ...valid, ALLOWED_GITHUB_LOGINS: " Octocat, ,hubot-2 " });

    expect(result.ok && result.value.ALLOWED_GITHUB_LOGINS).toEqual(["octocat", "hubot-2"]);
  });

  it.each([",", "bad_login", "-leading", "a".repeat(40)])("rejects allowlist %j", (logins) => {
    expect(errorsFor({ ALLOWED_GITHUB_LOGINS: logins }).join()).toMatch(/ALLOWED_GITHUB_LOGINS/);
  });

  it("parses KEEL_FAKE_EXTERNALS and rejects other values", () => {
    const result = parseEnv({ ...valid, KEEL_FAKE_EXTERNALS: "1" });

    expect(result.ok && result.value.KEEL_FAKE_EXTERNALS).toBe(true);
    expect(errorsFor({ KEEL_FAKE_EXTERNALS: "true" })).toEqual([
      'KEEL_FAKE_EXTERNALS must be "0" or "1"',
    ]);
  });

  it("refuses KEEL_FAKE_EXTERNALS in production", () => {
    expect(errorsFor({ NODE_ENV: "production", KEEL_FAKE_EXTERNALS: "1" })).toEqual([
      "KEEL_FAKE_EXTERNALS must not be enabled in production",
    ]);
  });
});
