/** Shown while a signed-in page checks the session, so the page is never blank. */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="p-6 text-sm text-zinc-500">
      {label}
    </p>
  );
}
