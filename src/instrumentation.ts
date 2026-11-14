export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@/lib/env");
  const env = getEnv();
  // `NODE_ENV` is inlined at build time, so production bundles leave out the fakes and MSW.
  // `getEnv()` already refuses the flag in production; this keeps the import out as well.
  if (process.env.NODE_ENV !== "production" && env.KEEL_FAKE_EXTERNALS) {
    const { startFakeExternals } = await import("@/test/fake-externals/server");
    startFakeExternals();
  }
}
