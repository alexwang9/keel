"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendCreate, type CreateRunError } from "@/lib/github/browser";
import type { CreateEvent } from "@/lib/github/events";
import type { CreateRequest } from "@/lib/github/request";

export type CreationRunState =
  { status: "idle" } | { status: "running" } | { status: "error"; error: CreateRunError };

export interface RepoCreation {
  state: CreationRunState;
  // Sends create requests until done, continuing automatically after `paused`.
  run: () => void;
}

interface RepoCreationDeps {
  // The next request, from the latest saved log.
  request: () => CreateRequest | null;
  // Saves one step of progress.
  record: (event: CreateEvent) => void;
}

const STALLED: CreateRunError = {
  code: "unknown",
  message: "GitHub is responding slowly, so creation paused. Resume to carry on.",
  retryable: true,
};

/**
 * Runs repo creation. Progress is saved as it streams; whether a run is going, and its error,
 * are not, so after a refresh the saved log shows what exists and the user resumes. Unmounting
 * aborts the request in flight; every step is idempotent, so that's safe.
 */
export function useRepoCreation({ request, record }: RepoCreationDeps): RepoCreation {
  const [state, setState] = useState<CreationRunState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** One request: records progress and returns its outcome, `null` once aborted. */
  const attempt = useCallback(
    async (body: CreateRequest, signal: AbortSignal) => {
      let created = 0;
      for await (const event of sendCreate(body, signal)) {
        if (event.type === "paused" || event.type === "error") return { event, created };
        record(event);
        if (event.type === "issue" && !event.existed) created += 1;
        if (event.type === "complete") return { event, created };
      }
      return null;
    },
    [record],
  );

  const loop = useCallback(
    async (signal: AbortSignal) => {
      for (;;) {
        const body = request();
        if (!body) break;
        const outcome = await attempt(body, signal);
        if (!outcome) return;
        const { event, created } = outcome;
        if (event.type === "error") {
          setState({ status: "error", error: event.error });
          return;
        }
        // A pause that created nothing would loop forever; let the user decide instead.
        if (event.type === "paused" && created === 0) {
          setState({ status: "error", error: STALLED });
          return;
        }
        if (event.type === "complete") break;
      }
      setState({ status: "idle" });
    },
    [attempt, request],
  );

  const run = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "running" });
    void loop(controller.signal).finally(() => {
      runningRef.current = false;
    });
  }, [loop]);

  return { state, run };
}
