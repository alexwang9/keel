import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpecReview } from "@/components/review/SpecReview";
import { err, ok } from "@/lib/result";
import { applySpecPatch } from "@/lib/spec/patch";
import { SpecSchema, type SpecDraft, type SpecOp } from "@/lib/spec/schema";
import { completeDraft } from "@/test/fixtures/spec";

const spec = SpecSchema.parse(completeDraft);

/** SpecReview with a real draft behind it, so saved edits show up like they do in the app. */
function Harness({ initial = completeDraft as SpecDraft, onApprove = vi.fn() }) {
  const [draft, setDraft] = useState(initial);
  const onSave = (ops: SpecOp[]) => {
    const result = applySpecPatch(draft, ops);
    if (!result.ok) return result;
    setDraft(result.value);
    return ok(undefined);
  };
  return (
    <SpecReview
      draft={draft}
      baseline={spec}
      onSave={onSave}
      onApprove={onApprove}
      onBackToInterview={() => ok(undefined)}
    />
  );
}

const section = (name: string) => within(screen.getByRole("region", { name }));
const approveButton = () => screen.getByRole("button", { name: "Approve spec" });

describe("SpecReview", () => {
  it("edits a text field and shows the new value", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Goal" }));
    const goal = screen.getByRole("textbox", { name: "Goal" });
    await userEvent.clear(goal);
    await userEvent.type(goal, "  One shared list.  ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(section("Goal").getByText("One shared list.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Goal" })).not.toBeInTheDocument();
  });

  it("validates as you type and blocks Save while the value is invalid", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Name must not be empty");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(section("Name").getByText("Shelf")).toBeInTheDocument();
  });

  it("keeps the form open with the errors when a save is rejected", async () => {
    const onSave = vi.fn(() => err(["name is taken"]));
    render(
      <SpecReview
        draft={completeDraft}
        baseline={spec}
        onSave={onSave}
        onApprove={vi.fn()}
        onBackToInterview={() => ok(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "ie");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith([{ op: "set", field: "name", value: "Shelfie" }]);
    expect(screen.getByRole("alert")).toHaveTextContent("name is taken");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("closes without saving when nothing changed", async () => {
    const onSave = vi.fn(() => ok(undefined));
    render(
      <SpecReview
        draft={completeDraft}
        baseline={spec}
        onSave={onSave}
        onApprove={vi.fn()}
        onBackToInterview={() => ok(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit Goal" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Goal" })).not.toBeInTheDocument();
  });

  it("adds, reorders and removes list items", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Constraints" }));
    await userEvent.click(screen.getByRole("button", { name: "Add constraint" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Constraint 3 must not be empty");

    await userEvent.type(screen.getByRole("textbox", { name: "Constraint 3" }), "Works offline");
    await userEvent.click(screen.getByRole("button", { name: "Move Constraint 3 up" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Constraint 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const items = section("Constraints").getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Works offline", "No paid services"]);
  });

  it("lets a list become empty", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Out of scope" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Out-of-scope item 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Out-of-scope item 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(section("Out of scope").getByText("None.")).toBeInTheDocument();
    expect(approveButton()).toBeEnabled();
  });

  it("edits the project type", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Project type" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "CLI");
    const detail = screen.getByRole("textbox", { name: "Detail" });
    await userEvent.clear(detail);
    expect(screen.getByRole("alert")).toHaveTextContent("Project type detail must not be empty");
    await userEvent.type(detail, "A terminal tool.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("region", { name: "Project type" })).toHaveTextContent(
      "CLI: A terminal tool.",
    );
  });

  it("enables Approve only for a complete spec, and lists what is missing", async () => {
    const onApprove = vi.fn();
    const incomplete: SpecDraft = {
      ...completeDraft,
      features: [{ id: "F1", title: "List", description: "A list.", acceptanceChecks: [] }],
      openQuestions: [{ id: "Q1", question: "Who closes a vote?" }],
    };
    const { unmount } = render(<Harness initial={incomplete} onApprove={onApprove} />);

    expect(approveButton()).toBeDisabled();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Features: Needs acceptance checks: List");
    expect(status).toHaveTextContent("1 open question(s)");
    unmount();

    render(<Harness onApprove={onApprove} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await userEvent.click(approveButton());
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("previews SPEC.md for a complete spec only", async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview SPEC.md" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("<!-- keel:spec v1 --> # Shelf");
    unmount();

    render(<Harness initial={{ ...completeDraft, features: [] }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview SPEC.md" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("appears once the spec is complete");
  });

  it("lists the edits that going back to the interview will describe", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Deployment" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Deployment" }), " Edge");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await userEvent.click(screen.getByRole("button", { name: "Back to interview" }));
    const form = within(screen.getByRole("form", { name: "Back to interview" }));
    expect(form.getByText("1 edit will be described to the interviewer")).toBeInTheDocument();
    expect(form.getByText("Changed the deployment target to: Vercel Edge")).toBeInTheDocument();
  });
});
