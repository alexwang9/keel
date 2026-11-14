import { z } from "zod";

// Shared by the create route and the browser, so no server-only imports here.

export const CREATE_STEPS = ["repo", "commit", "labels", "issues"] as const;

export const CREATE_ERROR_CODES = [
  // Creating: the name is in use (possibly by a private repo the pre-check can't see).
  "name_taken",
  // Resuming: the repo isn't one Keel can safely continue (different spec, or other commits).
  "not_resumable",
  "not_found",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "connection",
  "github_error",
] as const;

export const CreateErrorSchema = z.object({
  step: z.enum(CREATE_STEPS),
  code: z.enum(CREATE_ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
});

export const RepoRefSchema = z.object({
  fullName: z.string().min(1),
  htmlUrl: z.url(),
});

/**
 * Events streamed by `POST /api/github/create`, in order: `repo`, `step` for the commit and the
 * labels, one `issue` per ticket (`existed` when reconciling found it), then `complete`. A run
 * that reaches its deadline ends with `paused`; every step is idempotent, so the client simply
 * sends the request again. `error` ends the stream at the step that failed.
 */
export const CreateEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("repo"), repo: RepoRefSchema, created: z.boolean() }),
  z.object({
    type: z.literal("step"),
    step: z.enum(["commit", "labels"]),
    status: z.enum(["done", "skipped"]),
  }),
  z.object({
    type: z.literal("issue"),
    ticketId: z.string(),
    number: z.int().positive(),
    existed: z.boolean(),
  }),
  z.object({ type: z.literal("paused") }),
  z.object({ type: z.literal("complete") }),
  z.object({ type: z.literal("error"), error: CreateErrorSchema }),
]);

export type CreateStep = (typeof CREATE_STEPS)[number];
export type CreateErrorCode = (typeof CREATE_ERROR_CODES)[number];
export type CreateError = z.infer<typeof CreateErrorSchema>;
export type RepoRef = z.infer<typeof RepoRefSchema>;
export type CreateEvent = z.infer<typeof CreateEventSchema>;
