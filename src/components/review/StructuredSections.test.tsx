import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeDraft } from "@/test/fixtures/spec";
import { ReviewHarness } from "@/test/spec-review";

const region = (name: string) => screen.getByRole("region", { name });
const inRegion = (name: string) => within(region(name));
const click = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const approveButton = () => screen.getByRole("button", { name: "Approve spec" });
const confirmWith = (answer: boolean) => vi.spyOn(window, "confirm").mockReturnValue(answer);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("features", () => {
  it("adds a feature with the next id, validating it as you type", async () => {
    render(<ReviewHarness />);

    await click("Add feature");
    const form = within(screen.getByRole("form", { name: "Edit New feature" }));
    expect(form.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.type(form.getByRole("textbox", { name: "Title" }), "Export");
    expect(form.getByRole("alert")).toHaveTextContent("Feature description must not be empty");
    expect(form.getByRole("alert")).toHaveTextContent(
      "Feature acceptance check 1 must not be empty",
    );

    await userEvent.type(form.getByRole("textbox", { name: "Description" }), "Download the list.");
    await userEvent.type(
      form.getByRole("textbox", { name: "Acceptance check 1" }),
      "A CSV downloads.",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(inRegion("F3. Export").getByText("A CSV downloads.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add feature" })).toBeInTheDocument();
  });

  it("cancels a new feature without saving it", async () => {
    render(<ReviewHarness />);

    await click("Add feature");
    await click("Cancel");

    expect(screen.queryByRole("form", { name: "Edit New feature" })).not.toBeInTheDocument();
    expect(inRegion("Features").queryByText(/^F3\./)).not.toBeInTheDocument();
  });

  it("edits a feature's acceptance checks", async () => {
    render(<ReviewHarness />);

    await click("Edit F2. Vote on the next book");
    await click("Add acceptance check");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Acceptance check 3" }),
      "Ties re-vote.",
    );
    await click("Save");

    expect(inRegion("F2. Vote on the next book").getAllByRole("listitem")).toHaveLength(3);
  });

  it("removes a feature only after confirming, and gates Approve on having one", async () => {
    render(<ReviewHarness />);

    confirmWith(false);
    await click("Remove F1. Shared reading list");
    expect(region("F1. Shared reading list")).toBeInTheDocument();

    confirmWith(true);
    await click("Remove F1. Shared reading list");
    await click("Remove F2. Vote on the next book");

    expect(inRegion("Features").getByText("No features yet.")).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Features: not answered");
  });
});

describe("data model", () => {
  it("removes an entity together with the relationships pointing at it", async () => {
    const confirm = confirmWith(true);
    render(<ReviewHarness />);

    await click("Remove Book");

    expect(confirm).toHaveBeenCalledWith("Remove entity Book and its relationships (R1)?");
    expect(screen.queryByRole("region", { name: "Book" })).not.toBeInTheDocument();
    expect(inRegion("Data model").getByText("No relationships yet.")).toBeInTheDocument();
  });

  it("adds a relationship between existing entities", async () => {
    render(<ReviewHarness />);

    await click("Add relationship");
    const form = within(screen.getByRole("form", { name: "Edit New relationship" }));
    await userEvent.selectOptions(form.getByRole("combobox", { name: "To" }), "Book");
    await userEvent.selectOptions(form.getByRole("combobox", { name: "Kind" }), "many-to-many");
    await userEvent.type(form.getByRole("textbox", { name: "Description" }), "Clubs share books.");
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    expect(
      inRegion("R2: Club → Book").getByText("many-to-many: Clubs share books."),
    ).toBeInTheDocument();
  });

  it("blocks adding a relationship until there is an entity", async () => {
    confirmWith(true);
    render(<ReviewHarness />);

    await click("Remove Book");
    await click("Remove Club");

    expect(screen.getByRole("button", { name: "Add relationship" })).toBeDisabled();
    expect(inRegion("Data model").getByText("Add an entity first.")).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
  });

  it("asks before switching to none deletes the entities", async () => {
    const confirm = confirmWith(false);
    render(<ReviewHarness />);

    await click("Edit Data model needed");
    await userEvent.click(screen.getByRole("radio", { name: "No stored data" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Reason" }), "Stateless.");
    await click("Save");

    expect(confirm).toHaveBeenCalledWith(
      "This deletes 3 item(s) from Data model needed. Continue?",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved; the list was kept.");

    confirm.mockReturnValue(true);
    await click("Save");

    expect(inRegion("Data model").getByText("Not needed: Stateless.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Club" })).not.toBeInTheDocument();
    expect(approveButton()).toBeEnabled();
  });

  it("starts an empty list when a none data model becomes needed", async () => {
    render(
      <ReviewHarness initial={{ ...completeDraft, dataModel: { none: true, reason: "None." } }} />,
    );

    await click("Edit Data model needed");
    await userEvent.click(screen.getByRole("radio", { name: "Yes, it stores data" }));
    await click("Save");

    expect(inRegion("Data model").getByText("No entities yet.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Data model: No entities yet");
  });
});

describe("integrations and auth", () => {
  it("edits an integration and requires a reason for none", async () => {
    render(<ReviewHarness />);

    await click("Edit Open Library API");
    const purpose = screen.getByRole("textbox", { name: "Purpose" });
    await userEvent.clear(purpose);
    await userEvent.type(purpose, "Covers only.");
    await click("Save");
    expect(inRegion("Open Library API").getByText("Covers only.")).toBeInTheDocument();

    confirmWith(true);
    await click("Edit Integrations needed");
    await userEvent.click(screen.getByRole("radio", { name: "No external services" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Integrations needed reason must not be empty",
    );
  });

  it("switches auth to sign-in with a description", async () => {
    render(<ReviewHarness />);

    await click("Edit Auth");
    await userEvent.click(screen.getByRole("radio", { name: "Users sign in" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(description);
    await userEvent.type(description, "GitHub sign-in.");
    await click("Save");

    expect(inRegion("Auth").getByText("GitHub sign-in.")).toBeInTheDocument();
  });
});
