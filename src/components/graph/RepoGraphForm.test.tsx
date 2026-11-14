import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoGraphForm } from "@/components/graph/RepoGraphForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
});

async function submit(value: string): Promise<void> {
  render(<RepoGraphForm />);
  await userEvent.type(screen.getByLabelText("Repo"), value);
  await userEvent.click(screen.getByRole("button", { name: "Show graph" }));
}

describe("RepoGraphForm", () => {
  it("opens the graph page for a github.com link", async () => {
    await submit("https://github.com/octocat/shelf/issues");
    expect(push).toHaveBeenCalledWith("/app/graph/octocat/shelf");
  });

  it("explains an unreadable repo and clears the message on edit", async () => {
    await submit("shelf");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a GitHub repo as owner\/name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Repo")).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(screen.getByLabelText("Repo"), "x");
    expect(screen.queryByText(/Enter a GitHub repo/)).toBeNull();
  });
});
