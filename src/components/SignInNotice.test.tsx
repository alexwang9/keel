import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import { SignInNotice } from "@/components/SignInNotice";

async function renderNotice(error?: string | string[]): Promise<void> {
  const searchParams = Promise.resolve(error === undefined ? {} : { error });
  // `act` lets React resolve `use(searchParams)` before we assert.
  await act(async () => {
    render(
      <Suspense fallback={<span>loading</span>}>
        <SignInNotice searchParams={searchParams} />
      </Suspense>,
    );
    await searchParams;
  });
}

describe("SignInNotice", () => {
  it("explains a cancelled sign-in", async () => {
    await renderNotice("cancelled");

    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled/i);
  });

  it.each([undefined, "unknown", ["signin", "signin"]])("shows nothing for %j", async (error) => {
    await renderNotice(error);

    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
