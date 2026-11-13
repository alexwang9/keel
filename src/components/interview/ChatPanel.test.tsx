import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/interview/ChatPanel";
import type { HistoryMessage } from "@/lib/llm/interview/history";

const history: HistoryMessage[] = [
  { role: "user", content: "A book club app" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Noted." },
      { type: "tool_use", id: "t1", name: "update_spec", input: { ops: [] } },
    ],
  },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "secret-result" }] },
  { role: "assistant", content: [{ type: "text", text: "Who is it for?" }] },
];

function renderPanel(overrides: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  const props = {
    history,
    streamingText: "",
    status: "idle",
    error: null,
    awaitingReply: false,
    onSend: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof ChatPanel>;
  render(<ChatPanel {...props} />);
  return props;
}

const textbox = () => screen.getByRole("textbox", { name: "Message" });

describe("ChatPanel", () => {
  it("shows visible text only, merging the assistant's consecutive replies", () => {
    renderPanel();

    expect(screen.getByLabelText("You")).toHaveTextContent("A book club app");
    expect(screen.getByLabelText("Keel")).toHaveTextContent("Noted. Who is it for?");
    expect(screen.queryByText(/secret-result|update_spec/)).not.toBeInTheDocument();
  });

  it("invites a first message when the conversation is empty", () => {
    renderPanel({ history: [] });

    expect(screen.getByText(/Describe the software you want to build/)).toBeInTheDocument();
    expect(textbox()).toHaveAttribute("placeholder", "I want to build…");
  });

  it("sends trimmed text on Enter and clears the box; Shift+Enter adds a line", async () => {
    const { onSend } = renderPanel();

    await userEvent.type(textbox(), "Small clubs{Shift>}{Enter}{/Shift}mostly");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(textbox(), "  {Enter}");

    expect(onSend).toHaveBeenCalledWith("Small clubs\nmostly");
    expect(textbox()).toHaveValue("");
  });

  it("ignores blank messages", async () => {
    const { onSend } = renderPanel();

    await userEvent.type(textbox(), "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows the streaming reply and blocks sending while it streams", async () => {
    const { onSend } = renderPanel({ status: "streaming", streamingText: "Who uses" });

    expect(screen.getAllByLabelText("Keel").at(-1)).toHaveTextContent("Who uses");
    await userEvent.type(textbox(), "more{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a placeholder before the first streamed text", () => {
    renderPanel({ status: "streaming" });

    expect(screen.getAllByLabelText("Keel").at(-1)).toHaveTextContent("…");
  });

  it("offers Try again on a retryable error", async () => {
    const error = {
      code: "overloaded",
      message: "The AI service is busy.",
      retryable: true,
    } as const;
    const { onRetry } = renderPanel({ status: "error", error, awaitingReply: true });

    expect(screen.getByRole("alert")).toHaveTextContent("The AI service is busy.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers no retry when retrying can't help", () => {
    const error = { code: "refusal", message: "Try rephrasing.", retryable: false } as const;
    renderPanel({ status: "error", error, awaitingReply: true });

    expect(screen.getByRole("alert")).toHaveTextContent("Try rephrasing.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
