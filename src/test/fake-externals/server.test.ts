import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeCode, fetchUser } from "@/lib/auth/github";
import { installExternalFetch } from "@/lib/external-fetch";
import { createGitHubClient } from "@/lib/github/client";
import { createAnthropicClient } from "@/lib/llm/client";
import { createFakeFetch, FAKE_LOGIN, fakeHandlers } from "@/test/fake-externals/server";
import { FAKE_TOKEN } from "@/test/msw/github-oauth";

afterEach(() => {
  installExternalFetch(undefined);
});

const oauthClient = { clientId: "id", clientSecret: "secret" };

describe("fake externals", () => {
  it("refuses requests it has no fake for, without touching the network", async () => {
    const fakeFetch = createFakeFetch(fakeHandlers());
    await expect(fakeFetch("https://example.com/anything")).rejects.toThrow(
      "Fake externals: no fake for GET https://example.com/anything",
    );
  });

  it("is used by the OAuth helpers and the GitHub client once installed", async () => {
    const fakeFetch = vi.fn(createFakeFetch(fakeHandlers()));
    installExternalFetch(fakeFetch);

    const token = await exchangeCode(oauthClient, {
      code: "code",
      codeVerifier: "verifier",
      redirectUrl: "http://localhost:3000/api/auth/callback",
    });
    expect(token).toEqual({ ok: true, value: FAKE_TOKEN });
    expect(await fetchUser(FAKE_TOKEN)).toMatchObject({ ok: true, value: { login: FAKE_LOGIN } });

    const github = createGitHubClient(FAKE_TOKEN, { throttle: false, retries: 0 });
    const { data } = await github.repos.createForAuthenticatedUser({ name: "shelf" });
    expect(data.full_name).toBe(`${FAKE_LOGIN}/shelf`);
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it("is used by the Anthropic client once installed", async () => {
    const fakeFetch = vi.fn(createFakeFetch(fakeHandlers()));
    installExternalFetch(fakeFetch);
    const client = createAnthropicClient({ ANTHROPIC_API_KEY: "sk-ant-fake" });

    await expect(
      client.messages.create({ model: "x", max_tokens: 1, messages: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fakeFetch).toHaveBeenCalled();
  });
});
