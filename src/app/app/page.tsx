import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

// Layouts don't re-run on client navigation, so the page checks the session itself.
async function Workspace() {
  const user = await requireUser();
  return (
    <p className="text-zinc-600 dark:text-zinc-400">
      Signed in as {user.login}. The interview arrives in the next phase.
    </p>
  );
}

export default function AppPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <Suspense>
        <Workspace />
      </Suspense>
    </main>
  );
}
