import { expect, test, type Page } from "@playwright/test";

// Runs against `next dev` with KEEL_FAKE_EXTERNALS=1 (see playwright.config.ts): the fake
// interview fills the Shelf spec in two answers, generation returns its four tickets
// (T1 ← T2 ← T4, T1 ← T3 ← T4), and impact checks find nothing to change.

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("sign in → interview → approve → tickets → create → graph", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with GitHub" }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Interview: the first answer fills half the spec, the second finishes it.
  await send(page, "A web app for my book club to track what we read and vote on the next book.");
  await expect(page.getByText("What's out of scope, and where should it run?")).toBeVisible();
  await send(page, "No buying books. Deploy on Vercel, Open Library for covers, invite links.");
  await expect(page.getByRole("heading", { name: "Review your spec" })).toBeVisible();

  await page.getByRole("button", { name: "Approve spec" }).click();
  await expect(page.getByRole("heading", { name: "Spec approved" })).toBeVisible();

  // Tickets: generate, edit one, then check the impact of the edit.
  await page.getByRole("button", { name: "Generate tickets" }).click();
  await expect(page.getByRole("heading", { name: "Tickets (4)" })).toBeVisible();

  await page.getByRole("button", { name: "Edit T2: Add a book" }).click();
  const form = page.getByRole("form", { name: "Edit T2: Add a book" });
  await form.getByLabel("Title").fill("Add a book by title and author");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Check impact" }).click();
  await expect(page.getByText("No changes needed")).toBeVisible();
  await page.getByRole("button", { name: "Mark as checked" }).click();
  await expect(page.getByText("Edited", { exact: true })).toHaveCount(0);

  // Create: name step, then the repo, commit, labels and four issues.
  await page.getByRole("button", { name: "Create repo" }).click();
  await expect(page.getByLabel("Repo name")).toHaveValue("shelf");
  await page.getByRole("button", { name: "Create repo" }).click();
  await expect(page.getByRole("heading", { name: "Repo created" })).toBeVisible({
    timeout: 60_000,
  });

  // Graph: four issues and four arrows (jsdom can't draw edges, so this is their only check).
  const graph = page.getByRole("region", { name: "Dependencies" });
  await expect(graph.locator(".react-flow__node")).toHaveCount(4);
  await expect(graph.locator(".react-flow__edge")).toHaveCount(4);
  await expect(graph.getByText("Add a book by title and author")).toBeVisible();
});
