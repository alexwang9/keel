"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchGraph, type GraphLoadError } from "@/lib/github/browser";
import type { RepoRef } from "@/lib/github/repo-ref";
import type { RepoGraph } from "@/lib/graph/schema";

export type RepoGraphState =
  | { status: "loading" }
  | { status: "ready"; graph: RepoGraph }
  | { status: "error"; error: GraphLoadError };

const UNEXPECTED: GraphLoadError = {
  code: "failed",
  message: "Keel couldn't load the graph from GitHub. Try again.",
  retryable: true,
};

/**
 * Loads the graph fresh from GitHub on mount and on `retry`; it's never saved, since GitHub is
 * the source of truth. Leaving aborts the request. Key the caller by repo to load another one.
 */
export function useRepoGraph({ owner, name }: RepoRef): {
  state: RepoGraphState;
  retry: () => void;
} {
  const [state, setState] = useState<RepoGraphState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchGraph({ owner, name }, controller.signal)
      .then((result) => {
        setState(
          result.ok
            ? { status: "ready", graph: result.value }
            : { status: "error", error: result.error },
        );
      })
      // `fetchGraph` rethrows only aborts; anything else would be a bug, shown as a failure.
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "error", error: UNEXPECTED });
      });
    return () => {
      controller.abort();
    };
  }, [owner, name, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  return { state, retry };
}
