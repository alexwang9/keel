// Model choice per task. The only place model IDs, effort and token limits live (see DECISIONS.md).

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface TaskConfig {
  model: "claude-sonnet-5-5" | "claude-opus-5-5";
  effort: Effort;
  maxTokens: number;
}

export type Task = "interview" | "ticketGeneration" | "ticketRevision";

export const LLM_TASKS: Readonly<Record<Task, TaskConfig>> = {
  interview: { model: "claude-sonnet-5-5", effort: "low", maxTokens: 16_000 },
  ticketGeneration: { model: "claude-opus-5-5", effort: "high", maxTokens: 64_000 },
  ticketRevision: { model: "claude-opus-5-5", effort: "medium", maxTokens: 32_000 },
};

/** Server-side refusal fallback: Anthropic picks the fallback model by refusal category. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Model calls one interview request may make before it gives up (tool loop guard). */
export const INTERVIEW_MAX_STEPS = 5;
