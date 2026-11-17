import { CX_OBSERVATION, CX_PROJECT, mockCxApi } from "./fixtures/cxApi";
import { expect, test } from "./fixtures/auth";

/**
 * CX regression checks. The CX experience must keep working exactly as before
 * the CA work: project list, project detail with its exports, a saved
 * observation, and the four-step wizard's first step.
 */

test.beforeEach(async ({ page }) => {
  await mockCxApi(page);
});

test("CX project list renders", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText(CX_PROJECT.projectNumber)).toBeVisible();
  await expect(page.getByText(CX_PROJECT.name)).toBeVisible();
});

test("CX project detail shows observations and exports", async ({ page }) => {
  await page.goto(`/projects/${CX_PROJECT.projectNumber}`);
  await expect(page.getByRole("heading", { name: CX_PROJECT.name })).toBeVisible();
  // The page also holds a print-only copy of the report, so match the visible
  // on-screen list entry rather than the first text match.
  await expect(
    page.getByRole("link", { name: new RegExp(`^${CX_OBSERVATION.equipment}`) }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Print report/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Export deficiency log/ })).toBeEnabled();
  await expect(page.getByRole("link", { name: /New observation/ }).first()).toHaveAttribute(
    "href",
    `/projects/${CX_PROJECT.projectNumber}/observations/new/observation`,
  );
});

test("CX saved observation opens", async ({ page }) => {
  await page.goto(`/projects/${CX_PROJECT.projectNumber}/observations/${CX_OBSERVATION.id}`);
  await expect(
    page.getByText(CX_OBSERVATION.causes[0].text).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("CX wizard step 1 renders its form", async ({ page }) => {
  await page.goto(`/projects/${CX_PROJECT.projectNumber}/observations/new/observation`);
  await expect(page.getByPlaceholder("AHU-3")).toBeVisible();
  await expect(page.getByText("Field photos")).toBeVisible();
});
