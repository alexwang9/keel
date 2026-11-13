import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/interview/Workspace";
import { SpecSchema } from "@/lib/spec/schema";
import type { Ticket } from "@/lib/tickets/schema";
import { completeDraft } from "@/test/fixtures/spec";
import { shelfTickets } from "@/test/fixtures/tickets";
import { spec, storedProject, storeProject, T0 } from "@/test/stored-project";

function showTickets(items: Ticket[] = shelfTickets, checked: Ticket[] = items) {
  storeProject({ stage: "tickets", tickets: { items, checked, source: spec, generatedAt: T0 } });
  render(<Workspace />);
}

const card = (name: string | RegExp) => screen.getByRole("listitem", { name });
const gate = () => screen.getByRole("region", { name: "Create repo" });
const cardIds = () =>
  screen
    .getAllByRole("listitem", { name: /^T\d+:/ })
    .map((item) => item.getAttribute("aria-label")?.split(":")[0]);
const storedItems = () => storedProject()?.tickets?.items;

async function openEdit(name: string) {
  await userEvent.click(within(card(name)).getByRole("button", { name: `Edit ${name}` }));
  return within(card(name)).getByRole("form", { name: `Edit ${name}` });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("editing tickets", () => {
  it("is ready to create when nothing is edited, but creation isn't available yet", () => {
    showTickets();

    expect(gate()).toHaveTextContent("The tickets are ready.");
    expect(within(gate()).getByRole("button", { name: "Create repo" })).toBeDisabled();
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
  });

  it("saves an edited ticket, marks it edited and blocks creation until checked", async () => {
    showTickets();
    const form = await openEdit("T2: Add a book");

    const title = within(form).getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Add books");
    await userEvent.click(within(form).getByLabelText("Large"));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(within(card("T2: Add books")).getByText("Edited")).toBeInTheDocument();
    expect(storedItems()?.[1]).toMatchObject({ id: "T2", title: "Add books", size: "L" });
    expect(gate()).toHaveTextContent("Check the impact of 1 edited ticket on the rest.");
  });

  it("disables Save while the form is invalid", async () => {
    showTickets();
    const form = await openEdit("T2: Add a book");

    await userEvent.clear(within(form).getByLabelText("Title"));

    expect(within(form).getByRole("alert")).toHaveTextContent("Ticket title must not be empty");
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("isn't edited after saving an unchanged form", async () => {
    showTickets();
    const form = await openEdit("T4: Vote on the next book");
    // Unticking and reticking a dependency changes nothing.
    await userEvent.click(within(form).getByRole("checkbox", { name: /T2/ }));
    await userEvent.click(within(form).getByRole("checkbox", { name: /T2/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
    expect(gate()).toHaveTextContent("The tickets are ready.");
  });

  it("adds a ticket with the next id and a dependency", async () => {
    showTickets();
    await userEvent.click(screen.getByRole("button", { name: "Add ticket" }));
    const form = within(card("New ticket")).getByRole("form");

    await userEvent.type(within(form).getByLabelText("Title"), "Reading stats");
    await userEvent.type(within(form).getByLabelText("Description"), "Show books read per month.");
    await userEvent.type(
      within(form).getByLabelText("Acceptance check 1"),
      "Stats show per month.",
    );
    await userEvent.click(within(form).getByRole("checkbox", { name: /T3/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(cardIds()).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(card("T5: Reading stats")).toHaveTextContent("Depends on T3");
    expect(storedItems()?.[4]).toMatchObject({ id: "T5", dependsOn: ["T3"], size: "M" });
  });

  it("keeps the list in dependency order after an edit", async () => {
    showTickets();
    await userEvent.click(screen.getByRole("button", { name: "Add ticket" }));
    const added = within(card("New ticket")).getByRole("form");
    await userEvent.type(within(added).getByLabelText("Title"), "Accounts");
    await userEvent.type(within(added).getByLabelText("Description"), "Sign in.");
    await userEvent.type(within(added).getByLabelText("Acceptance check 1"), "A user signs in.");
    await userEvent.click(within(added).getByRole("button", { name: "Save" }));

    const form = await openEdit("T1: Club with a shared reading list");
    await userEvent.click(within(form).getByRole("checkbox", { name: /T5/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(cardIds()).toEqual(["T5", "T1", "T2", "T3", "T4"]);
  });

  it("shows a cycle on every ticket in it and blocks creation", async () => {
    showTickets();
    const form = await openEdit("T1: Club with a shared reading list");
    await userEvent.click(within(form).getByRole("checkbox", { name: /T4/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    for (const id of ["T1", "T2", "T4"]) {
      expect(screen.getByRole("list", { name: `Dependency problems for ${id}` })).toHaveTextContent(
        "dependency cycle: T1 → T4 → T2 → T1",
      );
    }
    expect(screen.queryByRole("list", { name: "Dependency problems for T3" })).toBeNull();
    expect(gate()).toHaveTextContent("Fix 1 dependency problem.");
  });
});

describe("deleting tickets", () => {
  it("names the dependents, then shows the dangling dependency until it's fixed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    showTickets();

    await userEvent.click(screen.getByRole("button", { name: "Delete T2" }));

    expect(confirm).toHaveBeenCalledWith(
      'Delete T2 "Add a book"? T4 depends on it, so the dependencies will need fixing before the repo can be created.',
    );
    expect(cardIds()).toEqual(["T1", "T3", "T4"]);
    expect(screen.getByRole("list", { name: "Dependency problems for T4" })).toHaveTextContent(
      "T4 depends on unknown ticket T2",
    );
    expect(gate()).toHaveTextContent("Fix 1 dependency problem.");

    const form = await openEdit("T4: Vote on the next book");
    const deleted = within(form).getByRole("checkbox", { name: /T2 \(deleted\)/ });
    await userEvent.click(deleted);
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("list", { name: /Dependency problems/ })).toBeNull();
    expect(storedItems()?.find((t) => t.id === "T4")?.dependsOn).toEqual(["T3"]);
    expect(gate()).not.toHaveTextContent("dependency problem");
  });

  it("keeps the ticket when deletion isn't confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    showTickets();

    await userEvent.click(screen.getByRole("button", { name: "Delete T4" }));

    expect(cardIds()).toEqual(["T1", "T2", "T3", "T4"]);
    expect(storedItems()).toEqual(shelfTickets);
  });

  it("doesn't reuse a deleted ticket's id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    showTickets();

    await userEvent.click(screen.getByRole("button", { name: "Delete T4" }));
    await userEvent.click(screen.getByRole("button", { name: "Add ticket" }));

    const form = within(card("New ticket")).getByRole("form");
    expect(
      within(form)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["T1: Club with a shared reading list", "T2: Add a book", "T3: Book status"]);
    await userEvent.type(within(form).getByLabelText("Title"), "Votes");
    await userEvent.type(within(form).getByLabelText("Description"), "Vote.");
    await userEvent.type(within(form).getByLabelText("Acceptance check 1"), "Votes count.");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(cardIds()).toEqual(["T1", "T2", "T3", "T5"]);
  });
});

describe("regenerating edited tickets", () => {
  it("warns that edits will be lost", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const renamed = SpecSchema.parse({ ...completeDraft, name: "Shelfie" });
    storeProject({
      stage: "tickets",
      approved: renamed,
      tickets: {
        items: shelfTickets.slice(0, 3),
        checked: shelfTickets,
        source: spec,
        generatedAt: T0,
      },
    });
    render(<Workspace />);

    expect(gate()).toHaveTextContent("The spec changed after these tickets were generated.");
    await userEvent.click(screen.getByRole("button", { name: "Regenerate tickets" }));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("edits to the tickets will be lost"),
    );
  });
});
