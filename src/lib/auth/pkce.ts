import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 crypto-random bytes, base64url. Used for the OAuth `state` and the PKCE verifier. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** PKCE `S256` challenge for a verifier (RFC 7636 §4.2). */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time string comparison, so a mismatched `state` leaks nothing through timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
