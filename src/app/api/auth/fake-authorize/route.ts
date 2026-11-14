import { NextResponse, type NextRequest } from "next/server";
import { callbackUrl } from "@/lib/auth/github";
import { getEnv } from "@/lib/env";

/** The fake code the fake token endpoint accepts. Any value works; it's never checked. */
const FAKE_CODE = "fake_oauth_code";

/**
 * Stands in for GitHub's authorize page when `KEEL_FAKE_EXTERNALS=1`: approves at once and sends
 * the browser back to the callback with the same `state`. Without the flag it doesn't exist.
 */
export function GET(request: NextRequest): Response {
  const env = getEnv();
  if (!env.KEEL_FAKE_EXTERNALS) return new NextResponse(null, { status: 404 });
  const url = new URL(callbackUrl(env));
  url.searchParams.set("code", FAKE_CODE);
  url.searchParams.set("state", request.nextUrl.searchParams.get("state") ?? "");
  return NextResponse.redirect(url);
}
