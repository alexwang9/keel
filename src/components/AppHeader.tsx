import { UserMenu } from "@/components/UserMenu";
import { requireUser } from "@/lib/auth/session";

/** Server component: reads the session and hands only the token-free user to the UI. */
export async function AppHeader() {
  const user = await requireUser();
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <span className="text-lg font-semibold tracking-tight">Keel</span>
      <UserMenu user={user} />
    </header>
  );
}
