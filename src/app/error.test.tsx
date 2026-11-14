import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  it("shows friendly copy, logs the details and offers a retry and a way back", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();
    const error = new Error("Cannot read properties of undefined");
    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Cannot read properties");
    expect(logged).toHaveBeenCalledWith(error);
    expect(screen.getByRole("link", { name: "Back to your project" })).toHaveAttribute(
      "href",
      "/app",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
