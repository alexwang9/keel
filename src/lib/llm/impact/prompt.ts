import type { Repair } from "@/lib/llm/repair";
import { TICKET_RULES } from "@/lib/llm/tickets/prompt";
import { formatDagError, validateDag } from "@/lib/tickets/dag";
import { describeTicketEdits } from "@/lib/tickets/describe";
import { newTicketId } from "@/lib/tickets/edit";
import type { Ticket } from "@/lib/tickets/schema";

/** Fixed for every request, so it sits in the cached prefix. */
export const IMPACT_SYSTEM_PROMPT = `You are a senior engineer reviewing edits a user made to a list of implementation tickets. The tickets were generated from an approved software spec, and each will become one pull request.

The user message holds the spec as SPEC.md, the current tickets as JSON (with the user's edits), what the user changed since the tickets were last checked, and any dependency problems the current tickets have.

Propose the smallest set of changes to the tickets that the user's edits make necessary, so the list stays consistent with the spec and with the rules below. Return them as JSON matching the output schema.

${TICKET_RULES}

How to propose changes:
- The user's edits are intentional. Keep them. Don't undo or rework an edited ticket unless the edit itself breaks a rule above, and then say so in the reason.
- Typical follow-ups: a deleted ticket's work moves into another ticket or a new one, and the tickets that depended on it get new dependencies; a narrowed ticket's dropped work goes to another ticket; a new ticket gets wired into the dependencies of the tickets that need it; acceptance checks elsewhere are updated to match.
- Fix every dependency problem listed. With all your changes applied, the dependencies must have no unknown ids, no self-references and no cycles.
- Ops apply in order to the current tickets. updateTicket changes only the fields it lists. Dependencies change only through addDependency and removeDependency. Don't add a dependency that already exists or remove one that doesn't.
- New tickets use the ids given at the end of the user message, in order.
- Every op has a reason: one or two plain sentences the user can judge it by, naming the edit that caused it.
- The user accepts or rejects each op on its own, so keep ops independent where you can.
- If nothing needs to change, return an empty list of ops. Don't propose changes for their own sake.`;

const bullets = (lines: readonly string[]): string =>
  lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : "None.";

/** The user message: spec, tickets, the edits and current problems, and the ids for new tickets. */
export function impactUserMessage(
  specMarkdown: string,
  checked: readonly Ticket[],
  tickets: readonly Ticket[],
): string {
  const dag = validateDag(tickets);
  const firstId = newTicketId(tickets, checked);
  return [
    "# Spec",
    "",
    specMarkdown.trimEnd(),
    "",
    "# Current tickets",
    "",
    "```json",
    JSON.stringify({ tickets }, null, 2),
    "```",
    "",
    "# The user's edits since the last check",
    "",
    describeTicketEdits(checked, tickets).join("\n"),
    "",
    "# Dependency problems in the current tickets",
    "",
    bullets(dag.ok ? [] : dag.error.map(formatDagError)),
    "",
    `New tickets use ids from ${firstId} upward (${firstId}, then the next numbers in order).`,
  ].join("\n");
}

/** The instruction sent with a previous proposal whose validation failed. */
export function impactRepairMessage(errors: readonly string[]): string {
  return [
    "Your proposal failed validation:",
    ...errors.map((error) => `- ${error}`),
    "",
    "Return the full corrected list of ops. Keep every op that was valid as it was, and fix only what these errors require.",
  ].join("\n");
}

/** The conversation for one call, plus the failed proposal and its errors when repairing. */
export function impactMessages(
  userMessage: string,
  repair: Repair | undefined,
): { role: "user" | "assistant"; content: string }[] {
  const first = { role: "user" as const, content: userMessage };
  if (!repair) return [first];
  return [
    first,
    { role: "assistant", content: repair.output },
    { role: "user", content: impactRepairMessage(repair.errors) },
  ];
}
