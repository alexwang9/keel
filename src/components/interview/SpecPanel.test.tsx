import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecPanel } from "@/components/interview/SpecPanel";
import { completeDraft } from "@/test/fixtures/spec";

const row = (label: string): HTMLElement => {
  const term = screen.getByText(label, { selector: "dt" });
  const container = term.parentElement;
  if (!container) throw new Error(`no row for ${label}`);
  return container;
};

describe("SpecPanel", () => {
  it("marks every field missing or optional on an empty draft", () => {
    render(<SpecPanel draft={{}} />);

    expect(screen.getByText("0 of 12 filled")).toBeInTheDocument();
    expect(row("Name")).toHaveAttribute("data-status", "missing");
    expect(within(row("Name")).getByText("Missing")).toBeInTheDocument();
    expect(row("Constraints")).toHaveAttribute("data-status", "optional");
    expect(screen.getByText("None right now.")).toBeInTheDocument();
  });

  it("shows filled fields with previews", () => {
    render(<SpecPanel draft={{ name: "Shelf", targetUsers: "Small book clubs." }} />);

    expect(screen.getByText("2 of 12 filled")).toBeInTheDocument();
    expect(within(row("Name")).getByText("Shelf")).toBeInTheDocument();
    expect(within(row("Target users")).getByText("Filled")).toBeInTheDocument();
  });

  it("flags a feature that still needs acceptance checks", () => {
    const features = [{ id: "F1", title: "Votes", description: "Vote.", acceptanceChecks: [] }];
    render(<SpecPanel draft={{ features }} />);

    expect(row("Features")).toHaveAttribute("data-status", "incomplete");
    expect(within(row("Features")).getByText("Needs acceptance checks: Votes")).toBeInTheDocument();
  });

  it("lists open questions", () => {
    const openQuestions = [
      { id: "Q1", question: "Can a member belong to several clubs?" },
      { id: "Q2", question: "Who closes a vote?" },
    ];
    render(<SpecPanel draft={{ openQuestions }} />);

    const list = within(screen.getByRole("region", { name: "Open questions" }));
    expect(list.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Can a member belong to several clubs?",
      "Who closes a vote?",
    ]);
  });

  it("shows a complete draft as fully filled", () => {
    render(<SpecPanel draft={completeDraft} />);

    expect(screen.getByText("12 of 12 filled")).toBeInTheDocument();
  });
});
