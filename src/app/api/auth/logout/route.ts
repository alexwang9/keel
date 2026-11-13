import { webCookies } from "iron-session";
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

// POST only: a GET logout could be triggered by any link or image on another site.
export async function POST(request: Request): Promise<Response> {
  const headers = new Headers();
  await clearSession(webCookies(request, headers));
  // 303 so the browser follows with a GET.
  return NextResponse.redirect(new URL("/", getEnv().APP_URL), { status: 303, headers });
}
