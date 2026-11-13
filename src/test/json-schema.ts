// Strict tool use and structured outputs reject these JSON Schema keywords (see the Anthropic
// structured outputs docs).
export const UNSUPPORTED_KEYWORDS = new Set([
  "oneOf",
  "minLength",
  "maxLength",
  "pattern",
  "maxItems",
  "minimum",
  "maximum",
  "multipleOf",
  "$schema",
]);

/** Every object inside a JSON value, depth first, the value itself included. */
export function* objectsIn(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* objectsIn(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  yield record;
  for (const child of Object.values(record)) yield* objectsIn(child);
}
