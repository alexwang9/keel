import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const APP_URL = `http://localhost:${String(PORT)}`;

// Dummy values: with KEEL_FAKE_EXTERNALS=1 every external call goes to in-process fakes, so none
// of these reach a real service. Set here, they take precedence over `.env.local`.
const fakeEnv = {
  KEEL_FAKE_EXTERNALS: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_URL,
  ANTHROPIC_API_KEY: "sk-ant-fake",
  GITHUB_CLIENT_ID: "fake-client-id",
  GITHUB_CLIENT_SECRET: "fake-client-secret",
  SESSION_SECRET: "fake-session-secret-".padEnd(40, "x"),
  ALLOWED_GITHUB_LOGINS: "octocat",
};

export default defineConfig({
  testDir: "./e2e",
  // One smoke test, sharing one in-memory GitHub: run it alone.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // `next dev`, not `next start`: production builds refuse KEEL_FAKE_EXTERNALS.
  webServer: {
    command: `next dev -p ${String(PORT)}`,
    url: APP_URL,
    env: fakeEnv,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
