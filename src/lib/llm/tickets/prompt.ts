import type { Repair } from "@/lib/llm/repair";

/** The rules every ticket follows, shared with the impact check. Limits match `TicketSchema`. */
export const TICKET_RULES = `Ticket rules:
- One user-visible behavior per ticket. A reviewer should be able to say what changed for the user, or for a developer using the project if it's a library or CLI.
- Each ticket touches roughly 3–8 files and targets a 200–500 line diff, tests included. Split anything bigger; merge anything trivially small into the ticket that needs it.
- Size: S is under ~200 lines and a few files; M is ~200–400 lines; L is ~400–500 lines or up to ~8 files. Nothing bigger than L.
- Title: short, imperative, names the behavior (e.g. "Add a book to the reading list"), at most 200 characters.
- Description: what to build and why, in plain language, with enough context from the spec to work without re-reading all of it. Mention the entities, integrations and constraints that apply. At most 4000 characters. Plain text with simple Markdown (paragraphs, lists) is fine.
- Acceptance checks: 1–20 plain-English statements anyone can verify by using the software, each at most 500 characters. Cover the spec feature's own acceptance checks that the ticket delivers. No implementation details such as function names.
- Dependencies: list the ids of tickets that must be merged first. Only real dependencies: a ticket depends on another if it can't be built or tested without it. No cycles, no self-references, no unknown ids, at most 20 per ticket.`;

/**
 * Fixed for every request, so it sits in the cached prefix. The ticket rules come from
 * DECISIONS.md (Tickets).
 */
export const TICKET_SYSTEM_PROMPT = `You are a senior engineer breaking an approved software spec into implementation tickets. A developer, or a coding agent, will pick up each ticket on its own and open one pull request for it.

The user message is the spec as SPEC.md. Return the full ticket list as JSON matching the output schema.

${TICKET_RULES}

Ordering and ids:
- Ids are T1, T2, T3, … with no gaps, in an order where every ticket depends only on tickets with lower ids.
- Start with the smallest foundation that makes the first user-visible behavior work (project setup goes into that first ticket, not a ticket of its own). Then follow the spec's features.

Coverage:
- Every core feature and every one of its acceptance checks is covered by at least one ticket.
- Respect the spec's project type, data model, integrations, auth, deployment target and constraints.
- Build nothing listed under "Out of scope".
- Aim for the fewest tickets that follow these rules; never more than 100.`;

/** The instruction sent with a previous output whose validation failed. */
export function repairMessage(errors: readonly string[]): string {
  return [
    "Your ticket list failed validation:",
    ...errors.map((error) => `- ${error}`),
    "",
    "Return the full corrected ticket list. Keep every ticket that was valid as it was, and fix only what these errors require.",
  ].join("\n");
}

/** The conversation for one call: the spec, plus the failed output and its errors when repairing. */
export function ticketMessages(
  specMarkdown: string,
  repair: Repair | undefined,
): { role: "user" | "assistant"; content: string }[] {
  const spec = { role: "user" as const, content: specMarkdown };
  if (!repair) return [spec];
  return [
    spec,
    { role: "assistant", content: repair.output },
    { role: "user", content: repairMessage(repair.errors) },
  ];
}
