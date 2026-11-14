import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { requireUser } from "@/lib/auth/session";

const navLinkClass = "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50";

/** Server component: reads the session and hands only the token-free user to the UI. */
export async function AppHeader() {
  const user = await requireUser();
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <nav aria-label="Main" className="flex items-center gap-5 text-sm">
        <Link href="/app" className="text-lg font-semibold tracking-tight">
          Keel
        </Link>
        <Link href="/app" className={navLinkClass}>
          Project
        </Link>
        <Link href="/app/graph" className={navLinkClass}>
          Graphs
        </Link>
      </nav>
      <UserMenu user={user} />
    </header>
  );
}
