import { mockCxApi } from "./fixtures/cxApi";
import { expect, test } from "./fixtures/auth";

/**
 * CA Field Reports shell: landing, header switcher, mock banner, project
 * list, New Project (source + manual), project tabs, edit and delete.
 * Runs against the mock CA store (see playwright.config.ts).
 */

/** Unique per viewport project, since both share one dev-server store. */
const manualNumber = (projectName: string) => `E2E-${projectName.toUpperCase()}-01`;

test("signed-in visit to / lands on CA Field Reports", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/field-reports$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByTestId("ca-mode-banner")).toContainText("MOCK DATA");
});

test("header switches between CA and CX, keeping them separate", async ({ page }) => {
  await mockCxApi(page);
  await page.goto("/field-reports");

  await expect(page.getByRole("link", { name: "Field Reports home" })).toHaveAttribute("href", "/field-reports");
  const switcher = page.getByRole("button", { name: /Switch field reports/ });
  await expect(switcher).toHaveAccessibleName(/Currently CA/);

  await switcher.click();
  await page.getByRole("menuitem", { name: /CX Field Reports/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("button", { name: /Switch field reports/ })).toHaveAccessibleName(/Currently CX/);
  // The mock banner belongs to CA only.
  await expect(page.getByTestId("ca-mode-banner")).toHaveCount(0);
  await expect(page.getByText("CX Field Reports").first()).toBeVisible();

  await page.getByRole("button", { name: /Switch field reports/ }).click();
  await page.getByRole("menuitem", { name: /CA Field Reports/ }).click();
  await expect(page).toHaveURL(/\/field-reports$/);
});

test("create a project from the source, open it and walk its tabs", async ({ page }) => {
  await page.goto("/field-reports");
  await page.getByRole("button", { name: "New project" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  const option = page.getByRole("option").first();
  const label = (await option.textContent()) ?? "";
  const projectNumber = label.split(" - ")[0].trim();
  await option.click();
  await dialog.getByRole("button", { name: "Create project" }).click();

  const row = page.getByTestId("ca-project-list").getByRole("link", { name: new RegExp(projectNumber) });
  await expect(row).toBeVisible();
  await expect(row.getByText("MOCK", { exact: true })).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/field-reports/${projectNumber}/capture$`));
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await expect(tabs.getByRole("link", { name: "Capture" })).toHaveAttribute("aria-current", "page");

  await tabs.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await tabs.getByRole("link", { name: "Site Route" }).click();
  await expect(page).toHaveURL(/\/route$/);

  // Back gesture walks the tabs rather than leaving the project.
  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/);
});

test("manual project: validation, create, edit, refuse duplicate, delete", async ({ page }, testInfo) => {
  const number = manualNumber(testInfo.project.name);
  await page.goto("/field-reports");

  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Enter manually").click();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog.getByText("Enter a valid project number.")).toBeVisible();

  await dialog.getByLabel(/Project number/).fill(number);
  await dialog.getByLabel(/Project name/).fill("E2E Manual Project");
  await dialog.getByLabel(/Client/).fill("E2E Owner");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("ca-project-list").getByText(number)).toBeVisible();

  // Duplicate number is refused by the server with a clear message.
  await page.getByRole("button", { name: "New project" }).click();
  await dialog.getByText("Enter manually").click();
  await dialog.getByLabel(/Project number/).fill(number);
  await dialog.getByLabel(/Project name/).fill("Duplicate");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText(/already set up in CA Field Reports/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Edit details.
  await page.getByRole("button", { name: `Actions for project ${number}` }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel(/Project name/).fill("E2E Manual Project (renamed)");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("E2E Manual Project (renamed)")).toBeVisible();

  // Delete.
  await page.getByRole("button", { name: `Actions for project ${number}` }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByTestId("ca-project-list").getByText(number)).toHaveCount(0);
});

test("an unknown CA project shows a clear message", async ({ page }) => {
  await page.goto("/field-reports/NOPE-404/capture");
  await expect(page.getByRole("heading", { name: "Project not available" })).toBeVisible();
  await expect(page.getByText("Project NOPE-404 was not found.").first()).toBeVisible();
});
