import { expect, test } from "@playwright/test";

/**
 * The access gate (src/proxy.ts) must keep rejecting unauthenticated access
 * to both experiences. No session cookie is set in these tests.
 */

test("signed-out page visits go to sign-in with returnTo", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/\?returnTo=%2Fprojects$/);
});

test("signed-out API calls get 401 JSON", async ({ request }) => {
  for (const path of ["/api/projects", "/api/ca/projects"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.json()).toHaveProperty("error");
  }
});
