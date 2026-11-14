"use client";

import { useId, useState } from "react";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/review/inputs";
import { checkRepoName } from "@/lib/github/browser";
import { repoNameProblem, suggestRepoName, type NameCheck } from "@/lib/github/repo-name";

type Taken = Extract<NameCheck, { available: false }>;

interface RepoNameStepProps {
  projectName: string;
  // `existing`: continue into the Keel repo the check found, instead of creating one.
  onStart: (repoName: string, existing: boolean) => void;
  onCancel: () => void;
}

function TakenNotice({
  name,
  taken,
  onUse,
  onResume,
}: {
  name: string;
  taken: Taken;
  onUse: (name: string) => void;
  onResume: () => void;
}) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p>
        You already have a repo called <strong>{name}</strong>.
        {taken.keel && " Keel created it, so it can continue there if it holds this spec."}
      </p>
      <div className="flex flex-wrap gap-2">
        {taken.suggestion && (
          <button
            type="button"
            onClick={() => {
              onUse(taken.suggestion ?? name);
            }}
            className={buttonClass}
          >
            Use {taken.suggestion}
          </button>
        )}
        {taken.keel && (
          <button type="button" onClick={onResume} className={buttonClass}>
            Continue in {name}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Picks the repo name, prefilled from the spec. Create checks the name with GitHub first; a
 * taken name offers a free alternative and, for a Keel repo, continuing into it.
 */
export function RepoNameStep({ projectName, onStart, onCancel }: RepoNameStepProps) {
  const id = useId();
  const [name, setName] = useState(() => suggestRepoName(projectName));
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState<Taken | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const problem = repoNameProblem(name);

  const rename = (next: string) => {
    setName(next);
    setTaken(null);
    setFailed(null);
  };

  const create = async () => {
    setChecking(true);
    const result = await checkRepoName(name);
    setChecking(false);
    if (!result.ok) {
      setFailed(result.error);
      return;
    }
    if (result.value.available) onStart(name, false);
    else setTaken(result.value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Repo name
        </label>
        <input
          id={id}
          value={name}
          onChange={(event) => {
            rename(event.target.value);
          }}
          aria-invalid={problem !== null}
          className={inputClass}
        />
        {problem && <p className="text-xs text-red-700 dark:text-red-300">{problem}</p>}
        <p className="text-xs text-zinc-500">
          Keel creates a public repo in your GitHub account, with SPEC.md and one issue per ticket.
        </p>
      </div>
      {taken && (
        <TakenNotice
          name={name}
          taken={taken}
          onUse={rename}
          onResume={() => {
            onStart(name, true);
          }}
        />
      )}
      {failed && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {failed}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={problem !== null || checking || taken !== null}
          onClick={() => void create()}
          className={primaryButtonClass}
        >
          {checking ? "Checking name…" : "Create repo"}
        </button>
        <button type="button" onClick={onCancel} disabled={checking} className={buttonClass}>
          Cancel
        </button>
      </div>
    </div>
  );
}
