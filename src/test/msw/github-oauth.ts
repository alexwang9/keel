import { http, HttpResponse, type RequestHandler } from "msw";

/** A recognisable fake token, so tests can assert it never leaks. */
export const FAKE_TOKEN = "gho_FakeTokenLeakCanary0123456789";
export const FAKE_AVATAR = "https://avatars.githubusercontent.com/u/583231?v=4";

export interface OAuthCalls {
  exchanges: Record<string, unknown>[];
  grantDeletions: { authorization: string | null; body: unknown }[];
}

interface GitHubOAuthOptions {
  login?: string;
  scope?: string;
  /** Returned by the token endpoint with HTTP 200, as GitHub does for bad codes. */
  exchangeError?: string;
  grantDeletionStatus?: number;
}

/** MSW handlers for GitHub's OAuth web flow, recording what Keel sent. */
export function githubOAuth(options: GitHubOAuthOptions = {}): {
  handlers: RequestHandler[];
  calls: OAuthCalls;
} {
  const calls: OAuthCalls = { exchanges: [], grantDeletions: [] };
  const handlers = [
    http.post("https://github.com/login/oauth/access_token", async ({ request }) => {
      calls.exchanges.push((await request.json()) as Record<string, unknown>);
      if (options.exchangeError) {
        return HttpResponse.json({
          error: options.exchangeError,
          error_description: "The code passed is incorrect or expired.",
          error_uri: "https://docs.github.com/apps",
        });
      }
      return HttpResponse.json({
        access_token: FAKE_TOKEN,
        token_type: "bearer",
        scope: options.scope ?? "public_repo",
      });
    }),
    http.get("https://api.github.com/user", ({ request }) => {
      if (request.headers.get("authorization") !== `token ${FAKE_TOKEN}`) {
        return HttpResponse.json({ message: "Bad credentials" }, { status: 401 });
      }
      return HttpResponse.json({
        login: options.login ?? "octocat",
        id: 1,
        avatar_url: FAKE_AVATAR,
      });
    }),
    http.delete("https://api.github.com/applications/:clientId/grant", async ({ request }) => {
      calls.grantDeletions.push({
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
      const status = options.grantDeletionStatus ?? 204;
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ message: "Server Error" }, { status });
    }),
  ];
  return { handlers, calls };
}
