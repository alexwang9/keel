import { z } from "zod";

// The one client-driven repair retry shared by ticket generation and impact checks (see
// DECISIONS.md, Phase 7). Client-safe: no SDK import.

/** Largest model output passed back for repair, in characters. 64k tokens stays well below it. */
export const MAX_REPAIR_OUTPUT_CHARS = 400_000;
/** Validation errors passed back for repair. More than this adds noise, not information. */
export const MAX_REPAIR_ERRORS = 30;

const MAX_ERROR_CHARS = 1000;

export const RepairErrorsSchema = z
  .array(z.string().min(1).max(MAX_ERROR_CHARS))
  .min(1)
  .max(MAX_REPAIR_ERRORS);

/** A failed output and why it failed, sent back once for the model to fix. */
export const RepairSchema = z.object({
  output: z.string().min(1).max(MAX_REPAIR_OUTPUT_CHARS),
  errors: RepairErrorsSchema,
});

export const InvalidEventSchema = z.object({
  type: z.literal("invalid"),
  output: z.string().max(MAX_REPAIR_OUTPUT_CHARS),
  errors: RepairErrorsSchema,
});

/** Fits errors into a repair request: each one shortened, and any beyond the cap summarised. */
export function capRepairErrors(errors: readonly string[]): string[] {
  const clipped = errors.map((error) => error.slice(0, MAX_ERROR_CHARS));
  if (clipped.length <= MAX_REPAIR_ERRORS) return clipped;
  const kept = clipped.slice(0, MAX_REPAIR_ERRORS - 1);
  return [...kept, `…and ${String(clipped.length - kept.length)} more problems`];
}

/** True when a failed output can be carried back in a repair request. */
export const repairable = (output: string): boolean =>
  output !== "" && output.length <= MAX_REPAIR_OUTPUT_CHARS;

export type Repair = z.infer<typeof RepairSchema>;
