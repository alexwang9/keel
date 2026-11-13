/** Any task's user-facing error: an interview turn or ticket generation. */
export interface NoticeError {
  code: string;
  message: string;
  retryable: boolean;
}

interface ErrorNoticeProps {
  error: NoticeError;
  onRetry: () => void;
}

/** Friendly copy for a failed request, with Retry when retrying can help. */
export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="mb-2 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <span>{error.message}</span>
      {error.code === "signed_out" && (
        // A plain link: the login route redirects off-site to GitHub.
        <a href="/api/auth/login" className="font-medium underline">
          Sign in
        </a>
      )}
      {error.retryable && (
        <button type="button" onClick={onRetry} className="font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}
