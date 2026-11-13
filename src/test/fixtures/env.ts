import { vi } from "vitest";

/** A valid env for tests that go through `getEnv()`. Values are fakes. */
export const testEnv = {
  APP_URL: "http://localhost:3000",
  ANTHROPIC_API_KEY: "sk-ant-test",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "test-session-secret-".padEnd(40, "x"),
  ALLOWED_GITHUB_LOGINS: "octocat",
} as const;

/**
 * Stubs `process.env` with `testEnv`. `getEnv()` caches per module instance, and Vitest isolates
 * modules per test file, so call this once per file before anything reads the env.
 */
export function stubTestEnv(): void {
  for (const [name, value] of Object.entries(testEnv)) vi.stubEnv(name, value);
}
