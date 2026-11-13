/** `name=value` pairs from a response's Set-Cookie headers, as a request `cookie` header. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** The Set-Cookie header for one cookie name, if the response set it. */
export function setCookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
}

/** True when the Set-Cookie header clears the cookie (empty value, expired). */
export function isCleared(header: string | undefined): boolean {
  if (!header) return false;
  return /^[^=]+=;/.test(header) && /max-age=0|expires=thu, 01 jan 1970/i.test(header);
}
