"use client";

import dynamic from "next/dynamic";

// The workspace lives in localStorage, which doesn't exist on the server: render it client-only.
export const WorkspaceLoader = dynamic(
  () => import("@/components/interview/Workspace").then((module) => module.Workspace),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-zinc-500">Loading your project…</p>,
  },
);
