import { z } from "zod";
import { RepoNameSchema } from "@/lib/github/repo-name";
import { parseJsonBody, type RequestProblem } from "@/lib/request-body";
import type { Result } from "@/lib/result";
import { SpecSchema, TranscriptSchema } from "@/lib/spec/schema";
import { formatDagError, validateDag } from "@/lib/tickets/dag";
import { TicketListSchema } from "@/lib/tickets/schema";

/**
 * Largest request body accepted, in bytes: the transcript is derived from an interview history
 * capped at 2 MB, plus a spec and a full ticket list, below Vercel's 4.5 MB request limit.
 */
export const MAX_CREATE_BODY_BYTES = 4_000_000;

/**
 * What the repo is built from. `resume` continues into an existing repo (from the client's
 * creation log, or a Keel repo the name check found) instead of creating one. The server checks
 * that the repo is safe to continue; the client is never trusted with that.
 */
export const CreateRequestSchema = z
  .object({
    repoName: RepoNameSchema,
    resume: z.boolean(),
    spec: SpecSchema,
    transcript: TranscriptSchema,
    tickets: TicketListSchema.min(1, "there must be at least one ticket"),
  })
  .superRefine((body, context) => {
    const dag = validateDag(body.tickets);
    if (dag.ok) return;
    for (const error of dag.error) {
      context.addIssue({ code: "custom", path: ["tickets"], message: formatDagError(error) });
    }
  });

export type CreateRequest = z.infer<typeof CreateRequestSchema>;

/** Parses and validates a raw request body. Never throws. */
export const parseCreateRequest = (body: string): Result<CreateRequest, RequestProblem> =>
  parseJsonBody(body, CreateRequestSchema, MAX_CREATE_BODY_BYTES);
