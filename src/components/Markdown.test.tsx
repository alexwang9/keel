import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/Markdown";

describe("Markdown", () => {
  it("renders emphasis, lists and code instead of showing the syntax", () => {
    render(<Markdown text={"**Name:** Shelf\n\n- one\n- two\n\nRun `pnpm dev`."} />);

    expect(screen.getByText("Name:").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["one", "two"]);
    expect(screen.getByText("pnpm dev").tagName).toBe("CODE");
    expect(document.body.textContent).not.toContain("**");
  });

  it("renders GitHub-flavoured task lists, as issues will", () => {
    render(<Markdown text={"- [ ] open\n- [x] done"} />);
    expect(screen.getAllByRole("checkbox").map((box) => (box as HTMLInputElement).checked)).toEqual(
      [false, true],
    );
  });

  it("drops raw HTML and unsafe links", () => {
    render(<Markdown text={'<img src="x" onerror="alert(1)"> [click](javascript:alert(1))'} />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("click").getAttribute("href")).toBe("");
  });

  it("opens links in a new tab", () => {
    render(<Markdown text="[docs](https://example.com)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
