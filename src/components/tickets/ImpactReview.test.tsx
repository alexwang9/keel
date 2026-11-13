import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/interview/Workspace";
import type { ImpactEvent } from "@/lib/llm/impact/events";
import type { Ticket } from "@/lib/tickets/schema";
import { checkedTickets, editedTickets, fixOps } from "@/test/fixtures/impact";
import { events, sseApi, type SseReply } from "@/test/msw/sse-routes";
import { spec, storedProject, storeProject, T0 } from "@/test/stored-project";

const impactApi = (replies: SseReply<ImpactEvent>[]) => sseApi("/api/tickets/impact", replies);
const proposal = (ops = fixOps) =>
  events<ImpactEvent>({ type: "started" }, { type: "complete", ops });

function showTickets(items: Ticket[] = editedTickets, checked: Ticket[] = checkedTickets) {
  storeProject({ stage: "tickets", tickets: { items, checked, source: spec, generatedAt: T0 } });
  render(<Workspace />);
}

const stored = () => storedProject()?.tickets;
const gate = () => screen.getByRole("region", { name: "Create repo" });
const review = () => screen.getByRole("region", { name: /Proposed changes|No changes needed/ });
const change = (n: number) =>
  within(review()).getByRole("listitem", { name: `Change ${String(n)}` });
const applyButton = () => within(review()).getByRole("button", { name: /Apply|Mark as checked/ });

async function decide(n: number, choice: "Accept" | "Reject") {
  await userEvent.click(within(change(n)).getByRole("button", { name: choice }));
}

async function openProposal(ops = fixOps) {
  const api = impactApi([proposal(ops)]);
  showTickets();
  await userEvent.click(screen.getByRole("button", { name: "Check impact" }));
  await screen.findByRole("region", { name: /Proposed changes|No changes needed/ });
  return api;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("impact check", () => {
  it("isn't offered when nothing is edited", () => {
    showTickets(checkedTickets);
    expect(screen.queryByRole("button", { name: "Check impact" })).not.toBeInTheDocument();
  });

  it("sends the spec and both lists, and shows each change with its reason", async () => {
    const api = await openProposal();

    expect(api.bodies).toEqual([
      JSON.parse(JSON.stringify({ spec, checked: checkedTickets, tickets: editedTickets })),
    ]);
    expect(change(1)).toHaveTextContent("1. Stop T4 depending on T3");
    expect(change(1)).toHaveTextContent("T3 was deleted.");
    expect(change(2)).toHaveTextContent('Add T5 "Track reading status"');
  });

  it("changes nothing until Apply, and locks editing while reviewing", async () => {
    await openProposal();
    const before = stored();

    await userEvent.click(within(review()).getByRole("button", { name: "Accept all" }));

    expect(stored()).toEqual(before);
    expect(screen.queryByRole("button", { name: /^Edit T/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add ticket" })).not.toBeInTheDocument();
  });

  it("requires a decision on every change before applying", async () => {
    await openProposal();
    await decide(1, "Accept");

    expect(review()).toHaveTextContent("Decide on 3 more to see the result.");
    expect(applyButton()).toBeDisabled();
  });

  it("applies the accepted changes and clears the unchecked edits", async () => {
    await openProposal();
    await userEvent.click(within(review()).getByRole("button", { name: "Accept all" }));

    expect(review()).toHaveTextContent("Applying adds T5, changes T4.");
    await userEvent.click(applyButton());

    expect(screen.queryByRole("region", { name: "Proposed changes" })).not.toBeInTheDocument();
    expect(stored()?.items.map((t) => t.id)).toEqual(["T1", "T2", "T5", "T4"]);
    expect(stored()?.checked).toEqual(stored()?.items);
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
    expect(gate()).toHaveTextContent("The tickets are ready.");
  });

  it("applies an accepted subset", async () => {
    await openProposal();
    await decide(1, "Accept");
    await decide(2, "Reject");
    await decide(3, "Reject");
    await decide(4, "Accept");
    await userEvent.click(applyButton());

    expect(stored()?.items.map((t) => t.id)).toEqual(["T1", "T2", "T4"]);
    expect(stored()?.items.at(-1)).toMatchObject({ dependsOn: ["T2"], size: "M" });
  });

  it("blocks a combination that leaves the dependencies invalid, and explains why", async () => {
    await openProposal();
    await decide(1, "Accept");
    await decide(2, "Reject");
    await decide(3, "Accept");
    await decide(4, "Accept");

    expect(within(review()).getByRole("alert")).toHaveTextContent(
      "T4 depends on unknown ticket T5",
    );
    expect(applyButton()).toBeDisabled();

    await userEvent.click(within(review()).getByRole("button", { name: "Reject all" }));
    expect(within(review()).getByRole("alert")).toHaveTextContent(
      "T4 depends on unknown ticket T3",
    );
    expect(applyButton()).toBeDisabled();
  });

  it("marks edits checked when no changes are needed", async () => {
    const valid = editedTickets.map((t) => (t.id === "T4" ? { ...t, dependsOn: ["T2"] } : t));
    impactApi([proposal([])]);
    showTickets(valid);
    await userEvent.click(screen.getByRole("button", { name: "Check impact" }));

    expect(
      await screen.findByText("Your edits don't affect the other tickets."),
    ).toBeInTheDocument();
    await userEvent.click(applyButton());

    expect(stored()?.checked).toEqual(stored()?.items);
    expect(gate()).toHaveTextContent("The tickets are ready.");
  });

  it("discards a proposal without changing anything", async () => {
    await openProposal();
    const before = stored();
    await userEvent.click(within(review()).getByRole("button", { name: "Discard" }));

    expect(stored()).toEqual(before);
    expect(screen.getByRole("button", { name: "Check impact" })).toBeInTheDocument();
    expect(gate()).toHaveTextContent("Check the impact of 1 edited ticket on the rest.");
  });

  it("shows an API error with a retry", async () => {
    const failed: ImpactEvent = {
      type: "error",
      error: { code: "overloaded", message: "The AI service is busy.", retryable: true },
    };
    impactApi([events(failed), proposal()]);
    showTickets();
    await userEvent.click(screen.getByRole("button", { name: "Check impact" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Proposed changes" })).toBeInTheDocument();
  });

  it("dismisses an error that can't be retried", async () => {
    impactApi([{ kind: "status", status: 401 }]);
    showTickets();
    await userEvent.click(screen.getByRole("button", { name: "Check impact" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("button", { name: "Check impact" })).toBeInTheDocument();
  });
});
