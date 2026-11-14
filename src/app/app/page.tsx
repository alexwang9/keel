import { Suspense } from "react";
import { PageLoading } from "@/components/PageLoading";
import { WorkspaceLoader } from "@/components/interview/WorkspaceLoader";
import { requireUser } from "@/lib/auth/session";

// Layouts don't re-run on client navigation, so the page checks the session itself.
async function SignedIn() {
  await requireUser();
  return <WorkspaceLoader />;
}

export default function AppPage() {
  return (
    <main className="flex h-[calc(100dvh-53px)] min-h-0 flex-col">
      <Suspense fallback={<PageLoading />}>
        <SignedIn />
      </Suspense>
    </main>
  );
}
