import Link from "next/link";
import { Suspense } from "react";
import { RepoGraphForm } from "@/components/graph/RepoGraphForm";
import { RepoGraphView } from "@/components/graph/RepoGraphView";
import { requireUser } from "@/lib/auth/session";
import { formatRepoRef, parseRepoRef } from "@/lib/github/repo-ref";

type Params = PageProps<"/app/graph/[owner]/[repo]">["params"];

// Layouts don't re-run on client navigation, so the page checks the session itself.
async function Graph({ params }: { params: Params }) {
  await requireUser();
  const { owner, repo } = await params;
  // Next decodes segments already; a valid owner or name never needs encoding anyway.
  const ref = parseRepoRef(`${owner}/${repo}`);
  if (!ref.ok) {
    return (
      <>
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {ref.error}
        </p>
        <RepoGraphForm />
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold">{formatRepoRef(ref.value)}</h1>
      {/* Keyed so moving to another repo starts a fresh load. */}
      <RepoGraphView key={formatRepoRef(ref.value)} repo={ref.value} />
    </>
  );
}

export default function RepoGraphPage({ params }: PageProps<"/app/graph/[owner]/[repo]">) {
  return (
    <main className="flex h-[calc(100dvh-53px)] min-h-0 w-full flex-col gap-3 p-6">
      <Link href="/app/graph" className="text-sm underline">
        Open another repo
      </Link>
      <Suspense>
        <Graph params={params} />
      </Suspense>
    </main>
  );
}
