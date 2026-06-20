import { test, expect } from "@playwright/test";

// Assumes a server is already running at 127.0.0.1:5180 serving a scanned repo
// (see Step 8 for the exact bring-up commands).
test("renders the overview and drills into a layer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Telos" })).toBeVisible();
  const firstNode = page.locator(".react-flow__node").first();
  await expect(firstNode).toBeVisible({ timeout: 10_000 });
  await firstNode.click();
  // After drilling, a second breadcrumb beyond "Overview" should appear.
  await expect(page.getByRole("navigation", { name: "breadcrumb" }).getByRole("button")).toHaveCount(2, { timeout: 10_000 });
});
