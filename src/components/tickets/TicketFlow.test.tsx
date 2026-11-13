import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/interview/Workspace";
import type { TicketEvent } from "@/lib/llm/tickets/events";
import { SpecSchema, type Spec } from "@/lib/spec/schema";
import type { z } from "zod";
import { PersistedStateSchema, ProjectSchema, STORAGE_KEY } from "@/lib/state/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets, ticket } from "@/test/fixtures/tickets";
import { events, sseApi, type SseReply } from "@/test/msw/sse-routes";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";
const T0 = "2026-11-12T10:00:00.000Z";
const spec = SpecSchema.parse(completeDraft);
const renamed: Spec = SpecSchema.parse({ ...completeDraft, name: "Shelfie" });

// What is written to storage, before parsing fills defaults such as `tickets.checked`.
function store(extra: Partial<z.input<typeof ProjectSchema>>) {
  const project = {
    id: ID,
    createdAt: T0,
    updatedAt: T0,
    stage: "approved",
    history: [{ role: "user", content: "hi" }],
    draft: completeDraft,
    spec,
    approved: spec,
    tickets: null,
    ...extra,
  };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, currentProjectId: ID, projects: { [ID]: project } }),
  );
}

const project = () => {
  const raw = localStorage.getItem(STORAGE_KEY) ?? "null";
  return Object.values(PersistedStateSchema.parse(JSON.parse(raw)).projects)[0];
};

const ticketApi = (replies: SseReply<TicketEvent>[]) => sseApi("/api/tickets/generate", replies);
const complete: TicketEvent = { type: "complete", tickets: shelfTickets };

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ticket generation", () => {
  it("generates tickets from the approved spec and shows them in order", async () => {
    const api = ticketApi([
      events<TicketEvent>({ type: "started" }, { type: "drafting", count: 2 }, complete),
    ]);
    store({});
    render(<Workspace />);

    await userEvent.click(screen.getByRole("button", { name: "Generate tickets" }));

    const list = await screen.findByRole("region", { name: "Tickets" });
    expect(within(list).getByRole("heading", { level: 1 })).toHaveTextContent("Tickets (4)");
    const cards = within(list).getAllByRole("listitem", { name: /^T\d/ });
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "T1: Club with a shared reading list",
      "T2: Add a book",
      "T3: Book status",
      "T4: Vote on the next book",
    ]);
    expect(cards[3]).toHaveTextContent("Depends on T2, T3");
    expect(api.bodies).toEqual([{ spec }]);
    expect(project()).toMatchObject({
      stage: "tickets",
      tickets: { items: shelfTickets, source: spec },
    });
  });

  it("shows progress while generating, including the automatic repair", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    ticketApi([
      events<TicketEvent>({ type: "started" }, { type: "invalid", output: "{}", errors: ["x"] }),
      // Held until the test has seen the repair progress.
      { kind: "events", events: [complete], gate },
    ]);
    store({});
    render(<Workspace />);

    await userEvent.click(screen.getByRole("button", { name: "Generate tickets" }));
    expect(await screen.findByText("Fixing 1 problem in the first draft…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit spec" })).not.toBeInTheDocument();
    release();

    expect(await screen.findByRole("region", { name: "Tickets" })).toBeInTheDocument();
  });

  it("shows an error with a retry, and retrying succeeds", async () => {
    const failed: TicketEvent = {
      type: "error",
      error: { code: "overloaded", message: "The AI service is busy.", retryable: true },
    };
    ticketApi([events(failed), events(complete)]);
    store({});
    render(<Workspace />);

    await userEvent.click(screen.getByRole("button", { name: "Generate tickets" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The AI service is busy.");
    expect(project()?.tickets).toBeNull();

    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Tickets" })).toBeInTheDocument();
  });

  it("restores the ticket list after a refresh", () => {
    store({ stage: "tickets", tickets: { items: shelfTickets, source: spec, generatedAt: T0 } });
    render(<Workspace />);

    expect(screen.getByRole("region", { name: "Tickets" })).toHaveTextContent(
      "Vote on the next book",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reopens review from the ticket list", async () => {
    store({ stage: "tickets", tickets: { items: shelfTickets, source: spec, generatedAt: T0 } });
    render(<Workspace />);

    await userEvent.click(screen.getByRole("button", { name: "Edit spec" }));
    expect(screen.getByRole("region", { name: "Spec review" })).toBeInTheDocument();
    expect(project()).toMatchObject({ stage: "review", tickets: { items: shelfTickets } });
  });
});

describe("stale tickets", () => {
  const old = { items: [ticket("T1")], source: spec, generatedAt: T0 };

  it("offers to view current tickets once the spec they came from is replaced", async () => {
    store({
      approved: renamed,
      tickets: { items: shelfTickets, source: renamed, generatedAt: T0 },
    });
    render(<Workspace />);

    expect(screen.getByRole("region", { name: "Approved spec" })).toHaveTextContent(
      "Tickets have been generated from this spec.",
    );
    await userEvent.click(screen.getByRole("button", { name: "View tickets" }));
    expect(screen.getByRole("region", { name: "Tickets" })).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
  });

  it("warns on the ticket list and regenerates after confirmation", async () => {
    const api = ticketApi([events(complete)]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    store({ stage: "tickets", approved: renamed, tickets: old });
    render(<Workspace />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("may be out of date");
    await userEvent.click(within(notice).getByRole("button", { name: "Regenerate tickets" }));

    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByText("Vote on the next book")).toBeInTheDocument();
    expect(api.bodies).toEqual([{ spec: renamed }]);
    expect(project()?.tickets).toMatchObject({ items: shelfTickets, source: renamed });
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
  });

  it("keeps the old tickets when regeneration isn't confirmed", async () => {
    const api = ticketApi([]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    store({ approved: renamed, tickets: old });
    render(<Workspace />);

    expect(screen.getByRole("region", { name: "Approved spec" })).toHaveTextContent(
      "may be out of date",
    );
    await userEvent.click(screen.getByRole("button", { name: "Regenerate tickets" }));

    expect(api.bodies).toEqual([]);
    expect(project()?.tickets).toEqual({ ...old, checked: old.items });
  });
});
