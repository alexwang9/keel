// Cookie names live apart from `session.ts` so `proxy.ts` can check for a session without
// importing server-only session code.
export const SESSION_COOKIE = "keel_session";
export const OAUTH_COOKIE = "keel_oauth";
