import { createCaProject } from "./fixtures/ca";
import { mockCxApi } from "./fixtures/cxApi";
import { expect, test } from "./fixtures/auth";

/**
 * CA Field Reports shell: landing, header switcher, mock banner, project
 * list, New Project (source, fallback, greyed-out, manual), reports grouped
 * by discipline, report steps, nav search, edit and delete.
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
  const title = page.getByTestId("field-reports-title");
  await expect(title).toHaveText("CA Field Reports");
  await expect(title).toHaveAttribute("href", "/field-reports");

  await switcher.click();
  await page.getByRole("menuitem", { name: /CX Field Reports/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("button", { name: /Switch field reports/ })).toHaveAccessibleName(/Currently CX/);
  await expect(title).toHaveText("CX Field Reports");
  await expect(title).toHaveAttribute("href", "/projects");
  // The mock banner belongs to CA only.
  await expect(page.getByTestId("ca-mode-banner")).toHaveCount(0);
  await expect(page.getByText("CX Field Reports").first()).toBeVisible();

  await page.getByRole("button", { name: /Switch field reports/ }).click();
  await page.getByRole("menuitem", { name: /CA Field Reports/ }).click();
  await expect(page).toHaveURL(/\/field-reports$/);
  await expect(title).toHaveText("CA Field Reports");
});

test("create a project from the source; reports by discipline; a draft keeps its author", async ({ page }) => {
  await page.goto("/field-reports");
  await page.getByRole("button", { name: "New project" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  // A project not created yet (another test may have created the first one).
  const option = page.locator('[role="option"]:not([data-already-created])').first();
  const label = (await option.textContent()) ?? "";
  const projectNumber = label.split(" - ")[0].trim();
  await option.click();
  await dialog.getByRole("button", { name: "Create project" }).click();

  const row = page.getByTestId("ca-project-list").getByRole("link", { name: new RegExp(projectNumber) });
  await expect(row).toBeVisible();
  await expect(row.getByText("MOCK", { exact: true })).toBeVisible();

  // Once created, it is greyed out in New Project with a tip.
  await page.getByRole("button", { name: "New project" }).click();
  await dialog.getByRole("combobox").click();
  const created = page.getByRole("option", { name: new RegExp(projectNumber.replace(/[.]/g, "\\.")) });
  await expect(created).toHaveAttribute("data-already-created", "true");
  await expect(created).toHaveAttribute("aria-disabled", "true");
  await expect(created).toContainText("Already created in Field Reports");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // The project opens on its reports, one section per discipline.
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/field-reports/${projectNumber}/reports$`));
  for (const discipline of ["Architecture", "Civil", "MP", "Electrical", "Structural"]) {
    await expect(page.getByRole("heading", { name: discipline, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Start a new ${discipline} report` })).toBeVisible();
  }

  // Starting a Civil report saves a draft at once and opens its Capture step.
  await page.getByRole("button", { name: "Start a new Civil report" }).click();
  await expect(page).toHaveURL(/\/reports\?report=carep_[^&]+&step=capture$/);
  const steps = page.getByRole("navigation", { name: "Report steps" });
  await expect(steps.getByRole("link", { name: "Capture" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ca-report-discipline")).toHaveText("Civil");
  await expect(page.getByTestId("ca-report-author")).toHaveText("Started by E2E Engineer");
  await steps.getByRole("link", { name: "Report" }).click();
  await expect(page.getByTestId("ca-report-editor")).toBeVisible();
  await steps.getByRole("link", { name: "Site Route" }).click();
  await expect(page).toHaveURL(/step=route$/);
  await expect(page.getByTestId("ca-tracking-placeholder")).toBeVisible();

  // Back gesture walks the steps rather than leaving the report.
  await page.goBack();
  await expect(page.getByTestId("ca-report-editor")).toBeVisible();

  // Leaving by accident loses nothing: the draft is listed under Civil, with its author.
  await page.goto(`/field-reports/${projectNumber}/reports`);
  const civil = page.getByTestId("ca-discipline-civil");
  await expect(civil.getByTestId("ca-report-row")).toHaveCount(1);
  await expect(civil.getByTestId("ca-report-row-author")).toHaveText("Started by E2E Engineer");
  await expect(page.getByTestId("ca-discipline-architecture").getByTestId("ca-report-row")).toHaveCount(0);
  await expect
    .poll(async () => (await (await page.request.get(`/api/ca/projects/${projectNumber}/reports`)).json()).reports)
    .toMatchObject([{ discipline: "civil", createdByName: "E2E Engineer", reportNumber: "001" }]);

  // Old project-level Capture and Site Route links land on the reports.
  for (const old of ["capture", "route"]) {
    await page.goto(`/field-reports/${projectNumber}/${old}`);
    await expect(page).toHaveURL(new RegExp(`/field-reports/${projectNumber}/reports$`));
  }
});

test("new project falls back to VantagePoint when the CA app is down", async ({ page }) => {
  await page.route("**/api/ca/source-projects", (route) =>
    route.fulfill({
      json: {
        source: "vantagepoint",
        fellBackFrom: "ca-app",
        notice: "The CA application could not be reached.",
        projects: [{ projectNumber: "E2E-VP-1", name: "VantagePoint Project", source: "vantagepoint", alreadyCreated: false }],
      },
    }),
  );
  await page.goto("/field-reports");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("ca-source-fallback")).toHaveText(
    "The CA app could not be reached, so these projects come from VantagePoint.",
  );
  await dialog.getByRole("combobox").click();
  await expect(page.getByRole("option", { name: /E2E-VP-1 - VantagePoint Project/ })).toBeVisible();
  // Manual entry is not offered while a source answers.
  await expect(dialog.getByLabel(/Project number/)).toHaveCount(0);
});

test("manual project: validation, create, edit, refuse duplicate, delete", async ({ page }, testInfo) => {
  const number = manualNumber(testInfo.project.name);
  // Manual entry is offered when no project source answers.
  await page.route("**/api/ca/source-projects", (route) =>
    route.fulfill({ json: { source: null, notice: "The CA application could not be reached.", projects: [] } }),
  );
  await page.goto("/field-reports");

  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("The CA application could not be reached.")).toBeVisible();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog.getByText("Enter a valid project number.")).toBeVisible();

  await dialog.getByLabel(/Project number/).fill(number);
  await dialog.getByLabel(/Project name/).fill("E2E Manual Project");
  await dialog.getByLabel(/Client/).fill("E2E Owner");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("ca-project-list").getByText(number)).toBeVisible();

  // Duplicate number is refused by the server with a clear message.
  await page.getByRole("button", { name: "New project" }).click();
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

test("nav search finds projects and reports; CA only", async ({ page }, info) => {
  const number = `E2E-SEARCH-${info.project.name.toUpperCase()}`;
  await createCaProject(page.request, number, "Searchable Fire Station");
  await page.goto(`/field-reports/${number}/reports`);
  await page.getByRole("button", { name: "Start a new Electrical report" }).click();
  await expect(page).toHaveURL(/step=capture/);
  // Wait for the draft to reach the server (it gets its number there).
  await expect
    .poll(async () => (await (await page.request.get(`/api/ca/projects/${number}/reports`)).json()).reports.length, {
      timeout: 30_000,
    })
    .toBe(1);

  await page.goto("/field-reports");
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "Search projects and reports" }).click();
  }
  const search = page.getByTestId("ca-nav-search");
  await search.fill("searchable fire");
  const results = page.getByTestId("ca-nav-search-results");
  await expect(results.getByRole("option", { name: new RegExp(`^${number} · Searchable Fire Station`) })).toBeVisible();
  await expect(results.getByRole("option", { name: new RegExp(`^Report 001 · Electrical ${number} `) })).toContainText("Started by E2E Engineer");

  // By project number: the report, opened straight from the result.
  await search.fill(number.toLowerCase());
  await results.getByRole("option", { name: new RegExp(`^Report 001 · Electrical ${number} `) }).click();
  await expect(page).toHaveURL(new RegExp(`/field-reports/${number}/reports\\?report=carep_`));
  await expect(page.getByTestId("ca-report-discipline")).toHaveText("Electrical");

  // CX pages have no CA search.
  await mockCxApi(page);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByTestId("ca-nav-search")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search projects and reports" })).toHaveCount(0);
});
