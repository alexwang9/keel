import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      {/* The header reads the session cookie, so it renders per request. */}
      <Suspense
        fallback={<div className="h-[53px] border-b border-zinc-200 dark:border-zinc-800" />}
      >
        <AppHeader />
      </Suspense>
      {children}
    </>
  );
}
