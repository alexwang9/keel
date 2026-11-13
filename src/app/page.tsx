export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-24 text-center font-sans dark:bg-black">
      <h1 className="text-5xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Keel
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Describe the software you want to build. Keel interviews you into a spec, breaks it into
        tickets, and sets up a GitHub repo with the issues and a dependency graph.
      </p>
      <button
        type="button"
        disabled
        className="h-12 rounded-full bg-zinc-950 px-6 font-medium text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
