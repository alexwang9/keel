import { getResponse, type RequestHandler } from "msw";
import { externalFetch, installExternalFetch } from "@/lib/external-fetch";
import { fakeAnthropic } from "@/test/fake-externals/anthropic";
import { fakeGitHub } from "@/test/msw/github";
import { githubOAuth } from "@/test/msw/github-oauth";

/** The login the fake OAuth flow signs in as. `ALLOWED_GITHUB_LOGINS` must include it. */
export const FAKE_LOGIN = "octocat";

/** Handlers for every external call Keel's server makes: Anthropic, GitHub API and OAuth. */
export function fakeHandlers(): RequestHandler[] {
  return [
    fakeAnthropic,
    ...githubOAuth({ login: FAKE_LOGIN }).handlers,
    ...fakeGitHub(FAKE_LOGIN).handlers,
  ];
}

/**
 * A fetch that answers from `handlers` and never touches the network: a request with no
 * handler fails like a network error, naming the URL.
 */
export function createFakeFetch(handlers: RequestHandler[]): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const response = await getResponse(handlers, request);
    if (!response) {
      throw new TypeError(`Fake externals: no fake for ${request.method} ${request.url}`);
    }
    return response;
  };
}

/**
 * Installs in-process fakes for `KEEL_FAKE_EXTERNALS=1`. Every external client (Anthropic,
 * GitHub, OAuth) is built with this fetch, so the real SDKs run against the fakes. Once per
 * process: the in-memory GitHub keeps its repos across dev-server recompiles.
 */
export function startFakeExternals(): void {
  if (externalFetch()) return;
  installExternalFetch(createFakeFetch(fakeHandlers()));
}
