import { expect, test, type Page } from "@playwright/test";

// README screenshots, taken in fake mode so they're reproducible: `pnpm screenshots`.
// Skipped by `pnpm test:e2e`.
test.skip(!process.env.KEEL_SCREENSHOTS, "Run with `pnpm screenshots`");
test.use({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });

// Hides the `next dev` indicator, which the deployed app doesn't have.
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `docs/screenshots/${name}.png`,
    style: "nextjs-portal { display: none; }",
  });

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("README screenshots", async ({ page }) => {
  await page.goto("/api/auth/login");
  await expect(page).toHaveURL(/\/app$/);

  await send(page, "A web app for my book club to track what we read and vote on the next book.");
  await expect(page.getByText("What's out of scope, and where should it run?")).toBeVisible();
  await shot(page, "interview");

  await send(page, "No buying books. Deploy on Vercel, Open Library for covers, invite links.");
  await page.getByRole("button", { name: "Approve spec" }).click();
  await expect(page.getByRole("heading", { name: "Spec approved" })).toBeVisible();
  await shot(page, "spec");

  await page.getByRole("button", { name: "Generate tickets" }).click();
  await expect(page.getByRole("heading", { name: "Tickets (4)" })).toBeVisible();
  await shot(page, "tickets");

  await page.getByRole("button", { name: "Create repo" }).click();
  await page.getByRole("button", { name: "Create repo" }).click();
  await expect(page.getByRole("heading", { name: "Repo created" })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto("/app/graph/octocat/shelf");
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  await shot(page, "graph");
});
