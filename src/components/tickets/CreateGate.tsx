import { primaryButtonClass } from "@/components/review/inputs";

/**
 * The Create repo button and what's blocking it. Repo creation arrives in Phase 10, so for now the
 * button stays disabled even when nothing blocks it.
 */
export function CreateGate({ blockers }: { blockers: readonly string[] }) {
  return (
    <section
      aria-label="Create repo"
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      {blockers.length > 0 ? (
        <>
          <p className="font-medium">Before creating the repo:</p>
          <ul className="list-disc pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>The tickets are ready. Repo creation isn&apos;t available yet.</p>
      )}
      <div>
        <button type="button" disabled className={primaryButtonClass}>
          Create repo
        </button>
      </div>
    </section>
  );
}
