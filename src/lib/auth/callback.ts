import "server-only";
import type { GitHubUser } from "@/lib/auth/github";
import { safeEqual } from "@/lib/auth/pkce";
import type { OAuthState, SessionData } from "@/lib/auth/session";
import { err, ok, type Result } from "@/lib/result";

export type CallbackFailure =
  | { reason: "cancelled" }
  | { reason: "stateMismatch" }
  | { reason: "exchangeFailed"; cause: unknown }
  | { reason: "userFailed"; cause: unknown }
  | { reason: "notAllowed"; login: string };

export interface CallbackParams {
  code: string | null;
  state: string | null;
  /** GitHub's `error` param, e.g. `access_denied` when the user clicks Cancel. */
  error: string | null;
}

export interface CallbackDeps {
  exchangeCode: (code: string, codeVerifier: string) => Promise<Result<string, unknown>>;
  fetchUser: (token: string) => Promise<Result<GitHubUser, unknown>>;
  /** Called for rejected users. Its outcome doesn't change theirs, so it reports nothing back. */
  discardToken: (token: string) => Promise<void>;
  isAllowed: (login: string) => boolean;
}

/** Turns a GitHub callback into session data, or the reason no session may be created. */
export async function completeSignIn(
  params: CallbackParams,
  stored: OAuthState | null,
  deps: CallbackDeps,
): Promise<Result<SessionData, CallbackFailure>> {
  if (params.error === "access_denied") return err({ reason: "cancelled" });
  if (!stored || !params.state || !params.code || !safeEqual(params.state, stored.state)) {
    return err({ reason: "stateMismatch" });
  }

  const token = await deps.exchangeCode(params.code, stored.codeVerifier);
  if (!token.ok) return err({ reason: "exchangeFailed", cause: token.error });

  const user = await deps.fetchUser(token.value);
  if (!user.ok) {
    await deps.discardToken(token.value);
    return err({ reason: "userFailed", cause: user.error });
  }

  if (!deps.isAllowed(user.value.login)) {
    await deps.discardToken(token.value);
    return err({ reason: "notAllowed", login: user.value.login });
  }

  return ok({ token: token.value, ...user.value });
}
