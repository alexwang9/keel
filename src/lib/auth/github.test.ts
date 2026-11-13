import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { exchangeCode, fetchUser } from "@/lib/auth/github";
import { FAKE_AVATAR, FAKE_TOKEN, githubOAuth } from "@/test/msw/github-oauth";
import { server } from "@/test/msw/server";

const client = { clientId: "id", clientSecret: "secret" };
const exchange = { code: "c", codeVerifier: "v", redirectUrl: "http://localhost:3000/cb" };

describe("exchangeCode", () => {
  it("returns the token and sends the verifier with the standard fields", async () => {
    const github = githubOAuth();
    server.use(...github.handlers);

    expect(await exchangeCode(client, exchange)).toEqual({ ok: true, value: FAKE_TOKEN });
    expect(github.calls.exchanges).toEqual([
      {
        client_id: "id",
        client_secret: "secret",
        code: "c",
        redirect_uri: "http://localhost:3000/cb",
        code_verifier: "v",
      },
    ]);
  });

  it("fails when the token lacks public_repo", async () => {
    server.use(...githubOAuth({ scope: "read:user" }).handlers);

    const result = await exchangeCode(client, exchange);

    expect(result.ok).toBe(false);
  });

  it("fails on GitHub's HTTP 200 error responses", async () => {
    server.use(...githubOAuth({ exchangeError: "bad_verification_code" }).handlers);

    const result = await exchangeCode(client, exchange);

    expect(!result.ok && String(result.error)).toMatch(/bad_verification_code/);
  });
});

describe("fetchUser", () => {
  it("returns the login and avatar", async () => {
    server.use(...githubOAuth().handlers);

    expect(await fetchUser(FAKE_TOKEN)).toEqual({
      ok: true,
      value: { login: "octocat", avatarUrl: FAKE_AVATAR },
    });
  });

  it("rejects an avatar from an unexpected host", async () => {
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ login: "octocat", avatar_url: "https://evil.example/a.png" }),
      ),
    );

    expect((await fetchUser(FAKE_TOKEN)).ok).toBe(false);
  });

  it("returns API errors instead of throwing", async () => {
    expect((await fetchUser("wrong-token")).ok).toBe(false);
  });
});
