"use client";

import Link from "next/link";
import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Catches errors that escape a screen's own error handling. The details went to the server log
 * (or the browser console); the user gets a way back. Saved state isn't touched.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Keel hit an unexpected problem showing this page. Your project is saved in this browser.
      </p>
      <div className="flex gap-4">
        <button type="button" onClick={reset} className="font-medium underline">
          Try again
        </button>
        <Link href="/app" className="font-medium underline">
          Back to your project
        </Link>
      </div>
    </main>
  );
}
