import type { CreateError, CreateErrorCode, CreateStep } from "@/lib/github/events";

interface Copy {
  message: string;
  retryable: boolean;
}

const COPY: Record<CreateErrorCode, Copy> = {
  name_taken: {
    message: "You already have a repo with that name. Pick another name.",
    retryable: false,
  },
  not_resumable: {
    message:
      "That repo already has other content, or was created from a different spec, so Keel won't add to it. Pick another name.",
    retryable: false,
  },
  not_found: {
    message: "Keel couldn't find the repo on GitHub. It may have been renamed or deleted.",
    retryable: false,
  },
  unauthorized: {
    message: "Your GitHub sign-in has expired. Sign in again, then resume.",
    retryable: false,
  },
  forbidden: {
    message: "GitHub didn't allow that. Check the repo's settings, then resume.",
    retryable: true,
  },
  rate_limited: {
    message: "GitHub is limiting requests right now. Wait a few minutes, then resume.",
    retryable: true,
  },
  connection: {
    message: "Couldn't reach GitHub. Check your connection, then resume.",
    retryable: true,
  },
  github_error: { message: "GitHub had a problem. Resume to try again.", retryable: true },
};

export const createError = (step: CreateStep, code: CreateErrorCode): CreateError => ({
  step,
  code,
  ...COPY[code],
});

const statusOf = (error: unknown): number | undefined =>
  error instanceof Error && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;

const headerOf = (error: unknown, name: string): string | undefined => {
  if (!(error instanceof Error) || !("response" in error)) return undefined;
  const response = error.response as { headers?: Record<string, unknown> } | undefined;
  const value = response?.headers?.[name];
  return typeof value === "string" ? value : undefined;
};

/**
 * Maps an Octokit error to a create error code. Octokit reports network failures as status 500
 * with no response, and primary rate limits as 403 with `x-ratelimit-remaining: 0`.
 */
export function githubErrorCode(error: unknown): CreateErrorCode {
  const status = statusOf(error);
  if (status === undefined) return "github_error";
  if (status === 500 && !(error instanceof Error && "response" in error && error.response)) {
    return "connection";
  }
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 403) {
    const limited =
      headerOf(error, "x-ratelimit-remaining") === "0" ||
      (error instanceof Error && /rate limit/i.test(error.message));
    return limited ? "rate_limited" : "forbidden";
  }
  if (status === 404) return "not_found";
  return "github_error";
}

/** The HTTP status of an Octokit error, for code that branches on expected statuses. */
export const githubStatus = statusOf;

interface ValidationEntry {
  code?: unknown;
  message?: unknown;
}

/** The `errors` of a 422 response; empty for anything else. */
function validationErrors(error: unknown): ValidationEntry[] {
  if (statusOf(error) !== 422 || !(error instanceof Error) || !("response" in error)) return [];
  const data = (error.response as { data?: { errors?: unknown } } | undefined)?.data;
  if (!Array.isArray(data?.errors)) return [];
  return data.errors.filter(
    (entry: unknown): entry is ValidationEntry => typeof entry === "object" && entry !== null,
  );
}

/** True for a 422 saying the thing already exists: a label (`already_exists`) or a repo name. */
export const isAlreadyExists = (error: unknown): boolean =>
  validationErrors(error).some(
    (entry) =>
      entry.code === "already_exists" ||
      (typeof entry.message === "string" && /already exists/i.test(entry.message)),
  );
