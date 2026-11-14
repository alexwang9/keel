import "server-only";
import {
  deleteAuthorization,
  exchangeWebFlowCode,
  getWebFlowAuthorizationUrl,
} from "@octokit/oauth-methods";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { Env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/result";

/** The only scope Keel asks for (see DECISIONS.md, GitHub section). */
export const OAUTH_SCOPE = "public_repo";

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

interface AuthorizeParams {
  redirectUrl: string;
  state: string;
  codeChallenge: string;
}

interface ExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUrl: string;
}

export const oauthClient = (env: Env): OAuthClient => ({
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
});

/** Must match the OAuth App's registered callback URL. */
export const callbackUrl = (env: Env): string =>
  new URL("/api/auth/callback", env.APP_URL).toString();

const UserSchema = z.object({
  login: z.string().min(1),
  // Pinned to GitHub's avatar host: it's the only host allowed by `images.remotePatterns`.
  avatar_url: z.url({ protocol: /^https$/, hostname: /^avatars\.githubusercontent\.com$/ }),
});

/** Base request for the OAuth endpoints; `@octokit/oauth-methods` maps it to github.com. */
const baseRequest = new Octokit().request;

/** GitHub's authorize URL. `@octokit/oauth-methods` has no PKCE options, so we append them. */
export function authorizationUrl(client: OAuthClient, params: AuthorizeParams): string {
  const { url } = getWebFlowAuthorizationUrl({
    clientType: "oauth-app",
    clientId: client.clientId,
    redirectUrl: params.redirectUrl,
    scopes: [OAUTH_SCOPE],
    state: params.state,
    request: baseRequest,
  });
  const withPkce = new URL(url);
  withPkce.searchParams.set("code_challenge", params.codeChallenge);
  withPkce.searchParams.set("code_challenge_method", "S256");
  return withPkce.toString();
}

/**
 * With `KEEL_FAKE_EXTERNALS=1`, the browser can't be sent to github.com, so sign-in goes to a
 * local stand-in that approves at once. The code exchange still runs, against the fakes.
 */
export function fakeAuthorizationUrl(env: Env, state: string): string {
  const url = new URL("/api/auth/fake-authorize", env.APP_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchanges the callback code for a user token. `exchangeWebFlowCode` builds its body from a
 * fixed field list, so `code_verifier` goes in through request defaults. The library still turns
 * GitHub's "error with HTTP 200" responses into thrown errors.
 */
export async function exchangeCode(
  client: OAuthClient,
  params: ExchangeParams,
): Promise<Result<string, unknown>> {
  try {
    const { authentication } = await exchangeWebFlowCode({
      clientType: "oauth-app",
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      code: params.code,
      redirectUrl: params.redirectUrl,
      request: baseRequest.defaults({ code_verifier: params.codeVerifier }),
    });
    if (!authentication.scopes.includes(OAUTH_SCOPE)) {
      return err(new Error(`Token lacks the ${OAUTH_SCOPE} scope`));
    }
    return ok(authentication.token);
  } catch (error: unknown) {
    return err(error);
  }
}

/** The signed-in user's login and avatar, validated because later code depends on both. */
export async function fetchUser(token: string): Promise<Result<GitHubUser, unknown>> {
  try {
    const { data } = await new Octokit({ auth: token }).users.getAuthenticated();
    const parsed = UserSchema.safeParse(data);
    if (!parsed.success) return err(parsed.error);
    return ok({ login: parsed.data.login, avatarUrl: parsed.data.avatar_url });
  } catch (error: unknown) {
    return err(error);
  }
}

/** Removes Keel from the user's authorized apps, revoking every token it holds for them. */
export async function deleteGrant(
  client: OAuthClient,
  token: string,
): Promise<Result<undefined, unknown>> {
  try {
    await deleteAuthorization({
      clientType: "oauth-app",
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      token,
      request: baseRequest,
    });
    return ok(undefined);
  } catch (error: unknown) {
    return err(error);
  }
}
