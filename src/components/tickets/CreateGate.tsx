"use client";

import { useState } from "react";
import { RepoNameStep } from "@/components/create/RepoNameStep";
import { primaryButtonClass } from "@/components/review/inputs";

interface CreateGateProps {
  blockers: readonly string[];
  projectName: string;
  onStart: (repoName: string, existing: boolean) => void;
}

/** The Create repo button and what's blocking it; with nothing blocking, it opens the name step. */
export function CreateGate({ blockers, projectName, onStart }: CreateGateProps) {
  const [naming, setNaming] = useState(false);
  const blocked = blockers.length > 0;

  return (
    <section
      aria-label="Create repo"
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      {blocked ? (
        <>
          <p className="font-medium">Before creating the repo:</p>
          <ul className="list-disc pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </>
      ) : (
        !naming && <p>The tickets are ready.</p>
      )}
      {naming && !blocked ? (
        <RepoNameStep
          projectName={projectName}
          onStart={onStart}
          onCancel={() => {
            setNaming(false);
          }}
        />
      ) : (
        <div>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setNaming(true);
            }}
            className={primaryButtonClass}
          >
            Create repo
          </button>
        </div>
      )}
    </section>
  );
}
