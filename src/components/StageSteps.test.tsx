import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageSteps, stepFor } from "@/components/StageSteps";
import { STAGES } from "@/lib/state/schema";

describe("stepFor", () => {
  it("maps every stage to a step, in flow order", () => {
    expect(STAGES.map(stepFor)).toEqual(["Interview", "Spec", "Spec", "Tickets", "Repo", "Graph"]);
  });

  it("starts at the interview when there's no project yet", () => {
    expect(stepFor(undefined)).toBe("Interview");
  });
});

describe("StageSteps", () => {
  it("marks the current step and the ones already done", () => {
    render(<StageSteps stage="tickets" />);
    const steps = screen.getAllByRole("listitem");

    expect(screen.getByRole("navigation", { name: "Progress" })).toBeInTheDocument();
    expect(steps.map((step) => step.textContent)).toEqual([
      "✓Interview(done)",
      "✓Spec(done)",
      "3Tickets",
      "4Repo",
      "5Graph",
    ]);
    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe("3Tickets");
  });
});
