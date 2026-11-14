import { http, HttpResponse, passthrough } from "msw";
import { setupServer, type SetupServer } from "msw/node";
import { fakeAnthropic } from "@/test/fake-externals/anthropic";
import { fakeGitHub } from "@/test/msw/github";
import { githubOAuth } from "@/test/msw/github-oauth";

/** The login the fake OAuth flow signs in as. `ALLOWED_GITHUB_LOGINS` must include it. */
export const FAKE_LOGIN = "octocat";

// A 1×1 grey PNG for the fake user's avatar, which Next's image optimizer fetches server-side.
const AVATAR_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

// Survives dev-server reloads of instrumentation, so the fakes start once per process and the
// in-memory GitHub keeps its repos.
const globalFakes = globalThis as typeof globalThis & { keelFakeExternals?: SetupServer };

/**
 * Starts in-process fakes for Anthropic, the GitHub API and GitHub's OAuth endpoints, for
 * `KEEL_FAKE_EXTERNALS=1`. The real SDKs run against them. Local requests pass through, and any
 * other request fails, so fake mode never reaches a real API.
 */
export function startFakeExternals(): void {
  if (globalFakes.keelFakeExternals) return;
  const server = setupServer(
    http.all(LOCAL, () => passthrough()),
    http.get(
      "https://avatars.githubusercontent.com/*",
      () => new HttpResponse(AVATAR_PNG, { headers: { "content-type": "image/png" } }),
    ),
    fakeAnthropic,
    ...githubOAuth({ login: FAKE_LOGIN }).handlers,
    ...fakeGitHub(FAKE_LOGIN).handlers,
  );
  server.listen({ onUnhandledFrame: "error" });
  globalFakes.keelFakeExternals = server;
}
