import { describe, expect, it, vi } from "vitest";
import { completeSignIn, type CallbackDeps } from "@/lib/auth/callback";
import { err, ok } from "@/lib/result";

const stored = { state: "the-state", codeVerifier: "the-verifier" };
const params = { code: "the-code", state: "the-state", error: null };
const user = { login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" };

function deps(overrides: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    exchangeCode: vi.fn(() => Promise.resolve(ok("token"))),
    fetchUser: vi.fn(() => Promise.resolve(ok(user))),
    discardToken: vi.fn(() => Promise.resolve()),
    isAllowed: vi.fn(() => true),
    ...overrides,
  };
}

describe("completeSignIn", () => {
  it("returns session data for an allowlisted user", async () => {
    const d = deps();

    expect(await completeSignIn(params, stored, d)).toEqual(ok({ token: "token", ...user }));
    expect(d.exchangeCode).toHaveBeenCalledWith("the-code", "the-verifier");
    expect(d.discardToken).not.toHaveBeenCalled();
  });

  it.each([
    ["no stored state", params, null],
    ["no state param", { ...params, state: null }, stored],
    ["no code", { ...params, code: null }, stored],
    ["a different state", { ...params, state: "other" }, stored],
  ])("rejects %s before calling GitHub", async (_, input, saved) => {
    const d = deps();

    expect(await completeSignIn(input, saved, d)).toEqual(err({ reason: "stateMismatch" }));
    expect(d.exchangeCode).not.toHaveBeenCalled();
  });

  it("reports a cancelled authorization", async () => {
    const result = await completeSignIn(
      { code: null, state: null, error: "access_denied" },
      stored,
      deps(),
    );

    expect(result).toEqual(err({ reason: "cancelled" }));
  });

  it("reports a failed exchange with its cause", async () => {
    const cause = new Error("bad code");
    const result = await completeSignIn(
      params,
      stored,
      deps({ exchangeCode: () => Promise.resolve(err(cause)) }),
    );

    expect(result).toEqual(err({ reason: "exchangeFailed", cause }));
  });

  it("discards the token when the user can't be fetched", async () => {
    const cause = new Error("500");
    const d = deps({ fetchUser: () => Promise.resolve(err(cause)) });

    expect(await completeSignIn(params, stored, d)).toEqual(err({ reason: "userFailed", cause }));
    expect(d.discardToken).toHaveBeenCalledWith("token");
  });

  it("discards the token of a user who isn't allowlisted", async () => {
    const d = deps({ isAllowed: () => false });

    expect(await completeSignIn(params, stored, d)).toEqual(
      err({ reason: "notAllowed", login: "octocat" }),
    );
    expect(d.discardToken).toHaveBeenCalledWith("token");
  });
});
