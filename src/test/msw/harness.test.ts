import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";

describe("MSW harness", () => {
  it("intercepts real Octokit requests at the HTTP layer", async () => {
    server.use(
      http.get("https://api.github.com/user", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("token test-token");
        return HttpResponse.json({ login: "octocat", id: 1 });
      }),
    );

    const octokit = new Octokit({ auth: "test-token" });
    const { data } = await octokit.users.getAuthenticated();

    expect(data.login).toBe("octocat");
  });

  it("blocks requests that have no handler instead of letting them reach the network", async () => {
    const octokit = new Octokit({ auth: "test-token", request: { retries: 0 } });

    await expect(octokit.repos.listForAuthenticatedUser()).rejects.toThrow(
      /\[MSW\] Cannot bypass a request/,
    );
  });
});
