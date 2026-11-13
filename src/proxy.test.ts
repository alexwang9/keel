import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

const request = (cookie = ""): NextRequest =>
  new NextRequest("http://localhost:3000/app", { headers: { cookie } });

describe("proxy", () => {
  it("runs only on /app routes", () => {
    expect(config.matcher).toEqual(["/app/:path*"]);
  });

  it("redirects to the landing page without a session cookie", () => {
    const response = proxy(request());

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("lets the request through when a session cookie is present", () => {
    const response = proxy(request("keel_session=sealed"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
