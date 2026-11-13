import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("landing page", () => {
  it("shows the product name and a disabled sign-in button", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Keel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeDisabled();
  });
});
