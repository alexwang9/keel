import Image from "next/image";
import type { SessionUser } from "@/lib/auth/session";

interface UserMenuProps {
  user: SessionUser;
}

/** Avatar, login and sign-out. Takes `SessionUser`, which has no token field. */
export function UserMenu({ user }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <Image src={user.avatarUrl} alt="" width={28} height={28} className="rounded-full" />
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{user.login}</span>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-full px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
