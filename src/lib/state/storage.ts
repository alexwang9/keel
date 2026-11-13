import { err, ok, type Result } from "@/lib/result";
import { PersistedStateSchema, STORAGE_KEY, type PersistedState } from "@/lib/state/schema";
import { formatIssues } from "@/lib/validation";

export type LoadResult =
  | { kind: "ok"; state: PersistedState }
  | { kind: "empty" }
  // Kept verbatim so the user can export it before resetting; never dropped silently.
  | { kind: "corrupt"; raw: string; reasons: string[] }
  | { kind: "unavailable" };

export type SaveProblem = "quota" | "unavailable";

/** localStorage, or null where reading it throws (blocked storage, some private modes). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Reported to the caller as null, which the UI shows as "progress won't be saved".
    return null;
  }
}

function parseStored(raw: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { kind: "corrupt", raw, reasons: ["saved data is not valid JSON"] };
  }
  const parsed = PersistedStateSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "corrupt", raw, reasons: formatIssues(parsed.error.issues) };
  }
  return { kind: "ok", state: parsed.data };
}

/** Reads and validates the saved state. Never throws. */
export function loadState(storage: Storage | null): LoadResult {
  if (!storage) return { kind: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  return raw === null ? { kind: "empty" } : parseStored(raw);
}

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");

/** Writes the state. Never throws; a full or blocked storage comes back as a problem. */
export function saveState(
  storage: Storage | null,
  state: PersistedState,
): Result<void, SaveProblem> {
  if (!storage) return err("unavailable");
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return ok(undefined);
  } catch (error) {
    return err(isQuotaError(error) ? "quota" : "unavailable");
  }
}

export function clearState(storage: Storage | null): Result<void, SaveProblem> {
  if (!storage) return err("unavailable");
  try {
    storage.removeItem(STORAGE_KEY);
    return ok(undefined);
  } catch {
    return err("unavailable");
  }
}
