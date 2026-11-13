import "server-only";
import { getIronSession, type CookieJar, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getEnv, type Env } from "@/lib/env";
import { logWarn } from "@/lib/log";
import { OAUTH_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookies";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_TTL_SECONDS = 10 * 60;

const SessionDataSchema = z.object({
  token: z.string().min(1),
  login: z.string().min(1),
  avatarUrl: z.url(),
});

const OAuthStateSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
});

/** Server-only session contents. The token never leaves the server. */
export type SessionData = z.infer<typeof SessionDataSchema>;
/** What UI code may see: the session without the token. */
export type SessionUser = Omit<SessionData, "token">;
/** The in-flight sign-in, kept between `/api/auth/login` and the callback. */
export type OAuthState = z.infer<typeof OAuthStateSchema>;

type CookieSource = CookieJar | Awaited<ReturnType<typeof cookies>>;

/** Cookies are `Secure` unless we're serving plain-HTTP localhost in development. */
export function isSecureCookie(env: Pick<Env, "APP_URL" | "NODE_ENV">): boolean {
  return env.NODE_ENV === "production" || new URL(env.APP_URL).protocol === "https:";
}

function sessionOptions(cookieName: string, ttl: number): SessionOptions {
  const env = getEnv();
  return {
    cookieName,
    password: env.SESSION_SECRET,
    ttl,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: isSecureCookie(env), path: "/" },
    onUnsealError: (reason) => {
      logWarn("auth.cookie_unseal_failed", { cookieName, reason });
    },
  };
}

async function read<T>(
  source: CookieSource,
  options: SessionOptions,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const session = await getIronSession<object>(source, options);
  const parsed = schema.safeParse({ ...session });
  return parsed.success ? parsed.data : null;
}

async function write(source: CookieSource, options: SessionOptions, data: object): Promise<void> {
  const session = await getIronSession<object>(source, options);
  Object.assign(session, data);
  await session.save();
}

async function destroy(source: CookieSource, options: SessionOptions): Promise<void> {
  const session = await getIronSession<object>(source, options);
  session.destroy();
}

const sessionCookie = (): SessionOptions => sessionOptions(SESSION_COOKIE, SESSION_TTL_SECONDS);
const oauthCookie = (): SessionOptions => sessionOptions(OAUTH_COOKIE, OAUTH_TTL_SECONDS);

export const readSession = (source: CookieSource): Promise<SessionData | null> =>
  read(source, sessionCookie(), SessionDataSchema);
export const writeSession = (source: CookieSource, data: SessionData): Promise<void> =>
  write(source, sessionCookie(), data);
export const clearSession = (source: CookieSource): Promise<void> =>
  destroy(source, sessionCookie());

export const writeOAuthState = (source: CookieSource, data: OAuthState): Promise<void> =>
  write(source, oauthCookie(), data);

/** Reads the in-flight sign-in and clears it, so each `state` is usable once. */
export async function takeOAuthState(source: CookieSource): Promise<OAuthState | null> {
  const state = await read(source, oauthCookie(), OAuthStateSchema);
  await destroy(source, oauthCookie());
  return state;
}

/** Full session for server code that calls GitHub (route handlers, later phases). */
export async function getSession(): Promise<SessionData | null> {
  // Unsealing checks expiry against the current time, so the session can't be read during a
  // prerender (Partial Prefetching prerenders cookie reads). `connection()` defers it to the request.
  await connection();
  return readSession(await cookies());
}

/** The signed-in user without the token, safe to render. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  return { login: session.login, avatarUrl: session.avatarUrl };
}

/** For protected pages: the signed-in user, or a redirect to the landing page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return user;
}
