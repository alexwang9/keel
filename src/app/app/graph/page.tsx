import { Suspense } from "react";
import { RepoGraphForm } from "@/components/graph/RepoGraphForm";
import { requireUser } from "@/lib/auth/session";

// Layouts don't re-run on client navigation, so the page checks the session itself.
async function SignedIn() {
  await requireUser();
  return <RepoGraphForm />;
}

export default function GraphIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Dependency graph</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Open the graph of any repo Keel created. It&apos;s read from the repo&apos;s issues, so it
        reflects changes made on GitHub.
      </p>
      <Suspense>
        <SignedIn />
      </Suspense>
    </main>
  );
}
