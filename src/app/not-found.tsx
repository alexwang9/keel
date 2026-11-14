import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        There&apos;s nothing at this address. Your project is saved in this browser, so nothing is
        lost.
      </p>
      <Link href="/app" className="font-medium underline">
        Back to your project
      </Link>
    </main>
  );
}
