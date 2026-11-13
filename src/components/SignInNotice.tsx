import { use } from "react";

const MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
  signin: "Something went wrong signing you in with GitHub. Please try again.",
};

interface SignInNoticeProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

/** Friendly copy for the `?error=` the auth callback redirects with. Unknown codes show nothing. */
export function SignInNotice({ searchParams }: SignInNoticeProps) {
  const { error } = use(searchParams);
  const message = typeof error === "string" ? MESSAGES[error] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="max-w-md text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}
