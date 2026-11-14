import "server-only";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { logWarn } from "@/lib/log";

const KeelOctokit = Octokit.plugin(retry, throttling);

/** Octokit with retry and throttling, authenticated as the signed-in user. */
export type GitHubClient = InstanceType<typeof KeelOctokit>;

export interface GitHubClientOptions {
  /** Octokit's write throttling spaces issue creation ~3s apart; tests turn it off. */
  throttle: boolean;
  /** Retries for 5xx and network errors (the retry plugin never retries 4xx except 429). */
  retries: number;
}

const DEFAULT_OPTIONS: GitHubClientOptions = { throttle: true, retries: 3 };

// One retry after a rate limit: GitHub says how long to wait, and a second hit means stop.
const RATE_LIMIT_RETRIES = 1;

/** The single GitHub API client factory for calls made with the user's token. */
export function createGitHubClient(
  token: string,
  options: GitHubClientOptions = DEFAULT_OPTIONS,
): GitHubClient {
  return new KeelOctokit({
    auth: token,
    request: { retries: options.retries },
    throttle: options.throttle
      ? {
          onRateLimit: (retryAfter, request, _octokit, retryCount) => {
            logWarn("github.rate_limited", { route: request.url, retryAfter, retryCount });
            return retryCount < RATE_LIMIT_RETRIES;
          },
          onSecondaryRateLimit: (retryAfter, request, _octokit, retryCount) => {
            logWarn("github.secondary_rate_limited", {
              route: request.url,
              retryAfter,
              retryCount,
            });
            return retryCount < RATE_LIMIT_RETRIES;
          },
        }
      : { enabled: false },
  });
}
