import type { GraphWarning } from "@/lib/graph/schema";

const issue = (number: number): string => `#${String(number)}`;

/** Plain-English copy for something edited on GitHub that the graph can't draw as written. */
export function warningText(warning: GraphWarning): string {
  switch (warning.kind) {
    case "unknownDependency":
      return `${issue(warning.issue)} depends on ${issue(warning.dependency)}, which isn't a Keel issue in this repo, so that arrow isn't drawn.`;
    case "selfDependency":
      return `${issue(warning.issue)} depends on itself, so that arrow isn't drawn.`;
    case "cycle":
      return `${warning.path.map(issue).join(" → ")} depend on each other in a loop. Edit one of them on GitHub to break it.`;
    case "notKeel":
      return `${issue(warning.issue)} is labelled status:backlog but wasn't created by Keel, so its dependencies aren't known.`;
    case "truncated":
      return `This repo has more than ${warning.limit.toLocaleString("en")} issues. The graph shows the oldest ${warning.limit.toLocaleString("en")}.`;
  }
}

/** Notes about issues edited on GitHub; nothing when the graph is drawn exactly as written. */
export function GraphWarnings({ warnings }: { warnings: readonly GraphWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section
      aria-label="Graph notes"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-medium">Notes on this graph</p>
      <ul className="list-disc pl-5">
        {warnings.map((warning) => (
          <li key={JSON.stringify(warning)}>{warningText(warning)}</li>
        ))}
      </ul>
    </section>
  );
}
