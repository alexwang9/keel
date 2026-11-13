import { document, normalize, oneLine } from "@/lib/markdown";
import { err, ok, type Result } from "@/lib/result";
import type { Ticket } from "@/lib/tickets/schema";

/**
 * What `parseIssueBody` recovers from an issue. Title and size live on the issue itself (title
 * and `size:*` label), so they aren't part of the body.
 */
export interface ParsedIssueBody {
  ticketId: string;
  description: string;
  acceptanceChecks: string[];
  /** Issue numbers, in body order, without repeats. */
  dependsOn: number[];
}

const FORMAT_VERSION = 1;
const CHECKS_HEADING = "## Acceptance checks";
const DEPENDENCIES_HEADING = "## Dependencies";

// The version is optional so bodies written before it was added (or by hand) still parse.
const MARKER = /<!--\s*keel:ticket=(T[1-9]\d{0,3})(?:\s+v(\d+))?\s*-->/;
const CHECK_LINE = /^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/;
const DEPENDENCY_LINE = /^(?:[-*]\s+)?depends on #([1-9]\d*)$/i;

export const ticketMarker = (id: string): string =>
  `<!-- keel:ticket=${id} v${String(FORMAT_VERSION)} -->`;

/**
 * Renders a ticket as a GitHub issue body. Every dependency must already have an issue number,
 * which holds when issues are created in topological order.
 */
export function renderIssueBody(
  ticket: Ticket,
  issueNumbers: ReadonlyMap<string, number>,
): Result<string, string> {
  const numbers: number[] = [];
  for (const dependency of ticket.dependsOn) {
    const number = issueNumbers.get(dependency);
    if (number === undefined)
      return err(`no issue number for ${dependency}, which ${ticket.id} depends on`);
    numbers.push(number);
  }

  return ok(
    document([
      ticketMarker(ticket.id),
      normalize(ticket.description),
      CHECKS_HEADING,
      ticket.acceptanceChecks.map((check) => `- [ ] ${oneLine(check)}`).join("\n"),
      DEPENDENCIES_HEADING,
      numbers.length === 0
        ? "None."
        : numbers.map((number) => `Depends on #${String(number)}`).join("\n"),
    ]),
  );
}

const lastIndexOf = (lines: readonly string[], heading: string, before: number): number =>
  lines.slice(0, before).findLastIndex((line) => line.toLowerCase() === heading.toLowerCase());

const matches = (lines: readonly string[], pattern: RegExp): string[] =>
  lines.flatMap((line) => {
    const captured = pattern.exec(line)?.[1];
    return captured === undefined ? [] : [captured.trim()];
  });

/**
 * Reads a Keel issue body back, tolerating edits made on GitHub: ticked checks, CRLF, extra
 * whitespace, a missing section (read as empty) and text added around the sections. The last
 * `## Dependencies` heading, and the last `## Acceptance checks` heading before it, mark the
 * sections, so a description that contains those headings or `Depends on #N` still round-trips.
 */
export function parseIssueBody(body: string): Result<ParsedIssueBody, string> {
  const text = normalize(body);
  const marker = MARKER.exec(text);
  if (!marker?.[1]) return err("not a Keel issue: no keel:ticket marker");
  if (marker[2] !== undefined && Number(marker[2]) !== FORMAT_VERSION) {
    return err(`unsupported Keel issue format v${marker[2]}`);
  }

  // Drop the marker and the blank lines around it; any text the user put above it is kept.
  const lines = [text.slice(0, marker.index), text.slice(marker.index + marker[0].length)]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join("\n\n")
    .split("\n");
  const trimmed = lines.map((line) => line.trim());
  const dependencies = lastIndexOf(trimmed, DEPENDENCIES_HEADING, trimmed.length);
  const dependenciesAt = dependencies === -1 ? trimmed.length : dependencies;
  const checks = lastIndexOf(trimmed, CHECKS_HEADING, dependenciesAt);
  const descriptionEnd = checks === -1 ? dependenciesAt : checks;

  return ok({
    ticketId: marker[1],
    description: normalize(lines.slice(0, descriptionEnd).join("\n")),
    acceptanceChecks:
      checks === -1 ? [] : matches(trimmed.slice(checks + 1, dependenciesAt), CHECK_LINE),
    dependsOn: [
      ...new Set(
        dependencies === -1
          ? []
          : matches(trimmed.slice(dependencies + 1), DEPENDENCY_LINE).map(Number),
      ),
    ],
  });
}
