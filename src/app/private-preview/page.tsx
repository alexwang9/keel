import Link from "next/link";

export default function PrivatePreview() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-24 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Keel is in private preview
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Thanks for your interest. Sign-in is limited to invited GitHub accounts for now. Keel
        hasn&apos;t kept any access to your GitHub account.
      </p>
      <Link href="/" className="font-medium text-zinc-950 underline dark:text-zinc-50">
        Back to the home page
      </Link>
    </main>
  );
}
