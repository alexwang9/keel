import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserMenu } from "@/components/UserMenu";

const user = { login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4" };

describe("UserMenu", () => {
  it("shows the avatar and login, and signs out with a POST", () => {
    const { container } = render(<UserMenu user={user} />);

    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(button.closest("form")).toHaveAttribute("method", "post");
  });

  it("can't render a token: its props carry only login and avatar", () => {
    const withToken = { ...user, token: "gho_should_not_render" };

    const { container } = render(<UserMenu user={withToken} />);

    expect(container.innerHTML).not.toContain("gho_should_not_render");
  });
});
