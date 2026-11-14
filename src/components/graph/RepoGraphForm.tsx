"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type SyntheticEvent } from "react";
import { inputClass, primaryButtonClass } from "@/components/review/inputs";
import { graphPath, parseRepoRef } from "@/lib/github/repo-ref";

/** Asks for a repo as owner/name or a github.com link, then opens its graph. */
export function RepoGraphForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const ref = parseRepoRef(value);
    if (!ref.ok) {
      setProblem(ref.error);
      return;
    }
    router.push(graphPath(ref.value));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={id} className="text-sm font-medium">
        Repo
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
          placeholder="owner/name or https://github.com/owner/name"
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className={inputClass}
        />
        <button type="submit" className={primaryButtonClass}>
          Show graph
        </button>
      </div>
      {problem && (
        <p id={`${id}-problem`} className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
    </form>
  );
}
