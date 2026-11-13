import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

async function renderHome(searchParams: Record<string, string> = {}): Promise<void> {
  const params = Promise.resolve(searchParams);
  await act(async () => {
    render(<Home params={Promise.resolve({})} searchParams={params} />);
    await params;
  });
}

describe("landing page", () => {
  it("shows the product name and a sign-in link to the login route", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Keel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in with GitHub" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
  });

  it("explains a failed sign-in", async () => {
    await renderHome({ error: "signin" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});
