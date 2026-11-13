import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";

// Built at module scope on purpose: the SDK captures `fetch` at construction (see setup.ts).
const moduleScopeAnthropic = new Anthropic({ apiKey: "sk-ant-test", maxRetries: 0 });

const causeChain = (error: unknown): string =>
  error instanceof Error ? `${error.message} <- ${causeChain(error.cause)}` : String(error);

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

  it("blocks Anthropic requests from a client built at module scope", async () => {
    const error: unknown = await moduleScopeAnthropic.messages
      .create({
        model: "claude-sonnet-5-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      })
      .catch((caught: unknown) => caught);

    // MSW's block surfaces as a connection error; a real API answer would be a 401 APIError.
    expect(error).toBeInstanceOf(Anthropic.APIConnectionError);
    expect(causeChain(error)).toMatch(/\[MSW\] Cannot bypass a request/);
  });
});
