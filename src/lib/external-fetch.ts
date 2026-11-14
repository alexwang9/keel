import "server-only";

// A global, not module state: Next bundles instrumentation and route handlers separately, so they
// don't share module instances.
const KEY = Symbol.for("keel.externalFetch");
type Holder = typeof globalThis & { [KEY]?: typeof fetch };

/**
 * Sets the fetch every client of an external service uses. Only `KEEL_FAKE_EXTERNALS=1` calls
 * this, from instrumentation (tests pass undefined to remove it). It's passed to each client
 * explicitly rather than patched onto `globalThis.fetch`, because `next dev` restores its own
 * fetch on every recompile.
 */
export function installExternalFetch(fetcher: typeof fetch | undefined): void {
  (globalThis as Holder)[KEY] = fetcher;
}

/** The installed fetch, or undefined so clients use their default (the real network). */
export function externalFetch(): typeof fetch | undefined {
  return (globalThis as Holder)[KEY];
}
