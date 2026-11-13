import type { Ticket } from "@/lib/tickets/schema";

const SIZE_LABELS: Record<Ticket["size"], string> = { S: "Small", M: "Medium", L: "Large" };

function TicketCard({ ticket }: { ticket: Ticket }) {
  const dependencies =
    ticket.dependsOn.length > 0 ? `Depends on ${ticket.dependsOn.join(", ")}` : "No dependencies";
  return (
    <li
      aria-label={`${ticket.id}: ${ticket.title}`}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">
          <span className="mr-2 font-mono text-sm text-zinc-500">{ticket.id}</span>
          {ticket.title}
        </h2>
        <span
          title={SIZE_LABELS[ticket.size]}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800"
        >
          {ticket.size}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-zinc-700 dark:text-zinc-300">
        {ticket.description}
      </p>
      <div className="text-sm">
        <h3 className="font-medium">Acceptance checks</h3>
        <ul className="list-disc pl-5">
          {ticket.acceptanceChecks.map((check, index) => (
            // Checks have no ids; position is their identity (see DECISIONS.md, Phase 1).
            <li key={index}>{check}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-zinc-500">{dependencies}</p>
    </li>
  );
}

/** Read-only tickets, in the order given (topological). Editing arrives in Phase 8. */
export function TicketList({ tickets }: { tickets: readonly Ticket[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </ol>
  );
}
