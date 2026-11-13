// Error codes every LLM task can produce. Client-safe: no SDK import. Each task's events extend
// the list with its own codes (the interview's `loop_limit`, ticket generation's `invalid_output`).
export const LLM_ERROR_CODES = [
  "rate_limited",
  "overloaded",
  "connection",
  "bad_request",
  "server_config",
  "billing",
  "refusal",
  "max_tokens",
  "unknown",
] as const;

export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];
