import type { Page } from "@playwright/test";

import { createCaProject, makeJpeg, waitForCached, waitForOfflineReady } from "./fixtures/ca";
import { expect, test } from "./fixtures/auth";

/**
 * Phase 4: report from selected photos, editing every section, print layout
 * rules, issuing immutable revisions, and the printed PDF.
 */

const num = (base: string, project: string) => `E2E-${base}-${project.toUpperCase()}`;
const capture = (n: string) => `/field-reports/${n}/capture`;

async function addPhotos(page: Page, labels: string[]) {
  const files = [];
  for (const label of labels) files.push({ name: `${label}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, label) });
  await page.getByTestId("ca-library-input").setInputFiles(files);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(labels.length);
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId("ca-report-sync")).toHaveText(/All changes saved and synced/, { timeout: 30_000 });
}

test("report from photos → edit → print layout → issue Rev 0 → revise → Rev 1", async ({ page }, info) => {
  const project = num("REP", info.project.name);
  await createCaProject(page.request, project, "Elementary School 01");
  await page.goto(capture(project));
  await addPhotos(page, ["North wall", "Rebar", "Slab edge"]);

  // Select the three photos and start a report with them.
  await page.getByRole("button", { name: "Select photos for a report" }).click();
  for (const tile of await page.getByTestId("ca-photo-tile").all()) await tile.click();
  await expect(page.getByText("3 selected")).toBeVisible();
  await page.getByRole("button", { name: "Create report" }).click();
  await expect(page).toHaveURL(/\/reports\?report=carep_/);
  await expect(page.getByTestId("ca-editor-item")).toHaveCount(1);
  await expect(page.getByText("Photos (3)")).toBeVisible();

  // Fill sections.
  await page.getByLabel("Temperature").fill("72°F");
  await page.getByRole("button", { name: "Clear" }).first().click();
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Person 1 name").fill("Jane Smith");
  await page.getByLabel("Person 1 company").fill("ACME Builders");
  await page.getByLabel("Item 001 status").selectOption("deficient");
  await page.getByLabel("Item 001 description").fill("Rebar exposed at north wall.");
  await page.getByLabel("Item 001 photo 1 caption").fill("North wall, grid 5");
  await page.getByRole("button", { name: "Add observation item" }).click();
  await page.getByLabel("Item 002 description").fill("General progress, no photos.");
  await waitSynced(page);
  await expect(page.getByTestId("ca-report-title")).toHaveText("Report 001");

  // Draft preview: template sections and photo-row rules.
  await page.getByRole("link", { name: "Preview / print draft" }).click();
  const doc = page.getByTestId("ca-report-document");
  await expect(doc).toBeVisible();
  await expect(doc.getByText("DRAFT — NOT ISSUED")).toBeVisible();
  await expect(page.getByTestId("ca-report-date-issued")).toHaveText("Not issued (draft)");
  await expect(page.getByTestId("ca-report-notice")).toBeVisible();
  await expect(doc.getByText("Jane Smith")).toBeVisible();
  await expect(doc.getByText("Temp: 72°F")).toBeVisible();
  const items = doc.getByTestId("ca-report-item");
  await expect(items).toHaveCount(2);
  const rows1 = items.nth(0).getByTestId("ca-report-photo-row");
  await expect(rows1).toHaveCount(2); // 3 photos → 2 + 1
  await expect(rows1.nth(1).locator("figure")).toHaveCount(1); // lone photo, left column
  const lone = await rows1.nth(1).locator("figure").boundingBox();
  const row = await rows1.nth(1).boundingBox();
  expect(lone!.x - row!.x).toBeLessThan(2);
  expect(lone!.width).toBeLessThan(row!.width * 0.6);
  await expect(items.nth(0).getByText("North wall, grid 5")).toBeVisible();
  // No photos → two empty "Photo" boxes.
  const rows2 = items.nth(1).getByTestId("ca-report-photo-row");
  await expect(rows2).toHaveCount(1);
  await expect(rows2.getByText("Photo", { exact: true })).toHaveCount(2);
  // Photos are never cropped.
  expect(await doc.locator(".photo img").first().evaluate((img) => getComputedStyle(img).objectFit)).toBe("contain");

  // Issue Rev 0.
  await page.getByRole("link", { name: "Back to report" }).click();
  await page.getByRole("button", { name: "Issue report" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue Rev 0" }).click();
  await expect(page).toHaveURL(/view=print&rev=0/);
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  await expect(page.getByTestId("ca-report-date-issued")).toHaveText(today);
  await expect(page.getByTestId("ca-report-rev")).toHaveText("No. 001 · Rev 0");
  await expect(page.getByText("DRAFT — NOT ISSUED")).toHaveCount(0);

  // The printed PDF: Letter pages with the template's footer.
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  const text = await pdfText(pdf);
  expect(text.pages).toBeGreaterThanOrEqual(1);
  expect(text.all).toContain("Page 1 of");
  expect(text.all).toContain(`Date Issued: ${today}`);
  expect(text.all).toContain("Building Community");
  expect(text.all).toContain("NOTICE OF DEFICIENT ITEMS");

  // Revise: Rev 0 stays as issued; the edit becomes Rev 1.
  await page.getByRole("link", { name: "Back to report" }).click();
  await expect(page.getByText(/Rev 0 is issued and cannot change/)).toBeVisible();
  await page.getByLabel("Item 001 description").fill("Rebar exposed at north wall. Contractor notified.");
  await expect(page.getByRole("button", { name: "Issue Rev 1" })).toBeVisible();
  await waitSynced(page);

  await page.getByRole("link", { name: "View / print Rev 0" }).click();
  await expect(page.getByText("Rebar exposed at north wall.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to report" }).click();

  await page.getByRole("button", { name: "Issue Rev 1" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue Rev 1" }).click();
  await expect(page).toHaveURL(/view=print&rev=1/);
  await expect(page.getByText("Contractor notified.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Back to report" }).click();
  await expect(page.getByTestId("ca-revisions").getByRole("link")).toHaveCount(2);

  // Issued reports are listed with their revision.
  await page.getByRole("link", { name: "All reports" }).click();
  await expect(page.getByTestId("ca-report-row")).toContainText("Issued · Rev 1");
});

test("a report started offline syncs and gets its number", async ({ page, context }, info) => {
  const project = num("ROFF", info.project.name);
  await createCaProject(page.request, project);
  // Online, the engineer only ever opens the Capture tab.
  await page.goto(capture(project));
  await waitForOfflineReady(page);
  await waitForCached(page, `/field-reports/${project}/reports`); // warmed, never visited

  // Offline: take a photo and start a report from it.
  await context.setOffline(true);
  await page.getByTestId("ca-library-input").setInputFiles({
    name: "offline.jpg",
    mimeType: "image/jpeg",
    buffer: await makeJpeg(page, "Offline"),
  });
  await expect(page.getByTestId("ca-photo-tile")).toHaveCount(1);
  await page.getByRole("button", { name: "Select photos for a report" }).click();
  await page.getByTestId("ca-photo-tile").click();
  await page.getByRole("button", { name: "Create report" }).click();
  await expect(page.getByTestId("ca-report-title")).toHaveText("New report");
  await expect(page.getByTestId("ca-editor-item")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Comments" }).fill("Written with no signal.");
  await expect(page.getByTestId("ca-report-sync")).toContainText("waiting to upload");

  // Closing and reopening the app with no signal keeps the report.
  await page.waitForTimeout(800); // let the autosave run
  await page.reload();
  await expect(page.getByTestId("ca-report-title")).toHaveText("New report");
  await expect(page.getByRole("textbox", { name: "Comments" })).toHaveValue("Written with no signal.");
  // Issuing needs a connection, and says so.
  await page.getByRole("button", { name: "Issue report" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue Rev 0" }).click();
  await expect(page.getByText("Issuing needs a connection").first()).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  await context.setOffline(false);
  await waitSynced(page);
  await expect(page.getByTestId("ca-report-title")).toHaveText("Report 001");
  const reports = await (await page.request.get(`/api/ca/projects/${project}/reports`)).json();
  expect(reports.reports).toHaveLength(1);
  expect(reports.reports[0].draft.comments).toBe("Written with no signal.");
});

/** Text of a PDF, per page, using pdf.js in Node. */
async function pdfText(pdf: Buffer): Promise<{ pages: number; all: string; perPage: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  const perPage: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    perPage.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { pages: doc.numPages, all: perPage.join("\n"), perPage };
}
