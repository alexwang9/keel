import "server-only";

type LogContext = Record<string, string | number | boolean>;

interface ErrorSummary {
  name: string;
  message: string;
  status?: number;
}

/**
 * Name, message and HTTP status only. Octokit errors carry the request they came from, whose
 * body can hold the client secret or a user token, so the raw error is never logged.
 */
export function describeError(error: unknown): ErrorSummary {
  if (!(error instanceof Error)) return { name: "NonError", message: String(error) };
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return { name: error.name, message: error.message, ...(status === undefined ? {} : { status }) };
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  console.error(JSON.stringify({ level: "error", event, ...context, error: describeError(error) }));
}

export function logWarn(event: string, context: LogContext = {}): void {
  console.warn(JSON.stringify({ level: "warn", event, ...context }));
}
