import type { Page } from "@playwright/test";

import {
  createCaProject,
  dropPinAt,
  importMockSheet,
  makeJpeg,
  openReportStep,
  startCaReport,
  waitForOfflineReady,
} from "./fixtures/ca";
import { expect, test } from "./fixtures/auth";

/**
 * Phase 4: report from its captured photos, editing every section, print
 * layout rules, issuing immutable revisions, and the printed PDF.
 */

const num = (base: string, project: string) => `E2E-${base}-${project.toUpperCase()}`;

async function addPhotos(page: Page, labels: string[]) {
  const files = [];
  for (const label of labels) files.push({ name: `${label}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, label) });
  await page.getByTestId("ca-library-input").setInputFiles(files);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(labels.length);
}

/** On the Report step: adds the photos taken in Capture as observation items. */
async function addCapturedPhotos(page: Page, count: number) {
  const banner = page.getByTestId("ca-unplaced-photos");
  await expect(banner).toContainText(`${count} photo${count === 1 ? "" : "s"} from Capture`);
  await banner.getByRole("button", { name: "Add to report" }).click();
  await expect(banner).toHaveCount(0);
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId("ca-report-sync")).toHaveText(/All changes saved and synced/, { timeout: 30_000 });
}

test("report from photos → edit → print layout → issue Rev 0 → revise → Rev 1", async ({ page }, info) => {
  const project = num("REP", info.project.name);
  await createCaProject(page.request, project, "Elementary School 01");
  await startCaReport(page, project);
  await addPhotos(page, ["North wall", "Rebar", "Slab edge"]);

  // On to the Report step: the three photos become the first item.
  await page.getByRole("link", { name: "Continue to report" }).click();
  await expect(page).toHaveURL(/\/reports\?report=carep_[^&]+$/);
  await addCapturedPhotos(page, 3);
  await expect(page.getByTestId("ca-editor-item")).toHaveCount(1);
  await expect(page.getByTestId("ca-editor-item").locator(".photo.has")).toHaveCount(3);

  // Fill sections.
  await page.getByLabel("Temperature").fill("72°F");
  await page.getByRole("button", { name: "Weather: Clear" }).click();
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

  // Issued reports are listed with their revision, under their discipline.
  await page.getByRole("link", { name: "All reports" }).click();
  await expect(page.getByTestId("ca-discipline-architecture").getByTestId("ca-report-row")).toContainText("Issued · Rev 1");
});

test("a report started offline syncs and gets its number", async ({ page, context }, info) => {
  const project = num("ROFF", `${info.project.name}${info.repeatEachIndex || ""}`);
  await createCaProject(page.request, project);
  // Online, the engineer only opens the project's reports.
  await page.goto(`/field-reports/${project}/reports`);
  await expect(page.getByRole("button", { name: "Start a new Civil report" })).toBeVisible();
  await waitForOfflineReady(page);

  // Offline: start a report, take a photo, and put it in the report.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Start a new Civil report" }).click();
  await expect(page).toHaveURL(/step=capture/);
  await page.getByTestId("ca-library-input").setInputFiles({
    name: "offline.jpg",
    mimeType: "image/jpeg",
    buffer: await makeJpeg(page, "Offline"),
  });
  await expect(page.getByTestId("ca-photo-tile")).toHaveCount(1);
  await openReportStep(page, "Report");
  await expect(page.getByTestId("ca-report-title")).toHaveText("New report");
  await addCapturedPhotos(page, 1);
  await expect(page.getByTestId("ca-editor-item")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Comments" }).fill("Written with no signal.");
  await expect(page.getByTestId("ca-report-sync")).toContainText("waiting to upload");

  // Closing and reopening the app with no signal keeps the report.
  await page.waitForTimeout(800); // let the autosave run
  await page.reload();
  await expect(page.getByTestId("ca-report-title")).toHaveText("New report");
  await expect(page.getByRole("textbox", { name: "Comments" })).toHaveText("Written with no signal.");
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
  // The discipline and who started it reached the server with the first sync.
  expect(reports.reports[0]).toMatchObject({ discipline: "civil", createdByName: "E2E Engineer" });
});

test("photo boxes on the template: take or choose a photo in place", async ({ page }, info) => {
  const project = num("BOX", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);
  await openReportStep(page, "Report");
  const editor = page.getByTestId("ca-report-editor");
  await expect(editor).toBeVisible();

  // Typing straight into the template.
  await page.getByRole("textbox", { name: "Summary of work progress" }).fill("Slab pour complete at Area B.");
  await page.getByRole("button", { name: "Add observation item" }).click();
  const item = page.getByTestId("ca-editor-item");
  // An item with no photos shows the template's two "Photo" boxes - tappable.
  await expect(item.getByTestId("ca-add-photo-box")).toHaveCount(2);

  // "Choose from device" into the empty box.
  const chooser = page.waitForEvent("filechooser");
  await item.getByTestId("ca-add-photo-box").first().click();
  await page.getByRole("menuitem", { name: "Choose from device" }).click();
  await (await chooser).setFiles({ name: "slab.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Slab") });
  await expect(item.locator(".photo.has")).toHaveCount(1);
  // Now one "+ Photo" box follows the photo, in the right-hand column.
  await expect(item.getByTestId("ca-add-photo-box")).toHaveCount(1);

  // "Take photo" uses the camera input (here: a file).
  const camera = page.waitForEvent("filechooser");
  await item.getByTestId("ca-add-photo-box").click();
  await page.getByRole("menuitem", { name: "Take photo" }).click();
  await (await camera).setFiles({ name: "cam.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Camera", "#4b5d4b") });
  await expect(item.locator(".photo.has")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Item 001 photo 2 caption" }).fill("Taken from the report");

  // Project photo box: pick one of the project's photos.
  await page.getByTestId("ca-cover-box").click();
  await page.getByRole("menuitem", { name: "Choose from project photos" }).click();
  await page.getByTestId("ca-photo-picker").getByTestId("ca-picker-photo").first().click();
  await page.getByRole("button", { name: "Use photo" }).click();
  await expect(page.getByTestId("ca-cover-box").locator("img")).toHaveCount(1);

  // Photos added in the report are project photos too, saved and synced.
  await waitSynced(page);
  await expect.poll(async () => (await (await page.request.get(`/api/ca/projects/${project}/photos`)).json()).photos.length).toBe(2);

  // The preview prints them in the template's layout.
  await page.getByRole("link", { name: "Preview / print draft" }).click();
  const doc = page.getByTestId("ca-report-document");
  await expect(doc.locator(".photo.has img")).toHaveCount(2);
  await expect(doc.getByText("Taken from the report")).toBeVisible();
  await expect(doc.locator(".pphoto.has img")).toHaveCount(1);
  await expect(doc.getByText("Slab pour complete at Area B.")).toBeVisible();
});

test("photo panel: photos grouped by pin, selected and dragged onto photo boxes", async ({ page }, info) => {
  const project = num("PANEL", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);

  // Two photos at a pin, one with no pin.
  await importMockSheet(page);
  const pinSheet = await dropPinAt(page, 0.3, 0.4);
  await pinSheet.getByLabel("Pin label").fill("Mech room 110");
  await pinSheet.getByTestId("ca-library-input").setInputFiles([
    { name: "duct.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Duct") },
    { name: "valve.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Valve", "#4b5d4b") },
  ]);
  await expect(pinSheet.getByText("Photos at this pin (2)")).toBeVisible();
  await pinSheet.getByRole("button", { name: "Save pin" }).click();
  await expect(pinSheet).toHaveCount(0);
  await page.getByTestId("ca-library-input").first().setInputFiles({ name: "site.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Site") });
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(3);

  // The Capture step lists photos grouped by pin, unpinned last.
  await expect(page.getByTestId("ca-photo-group-title")).toHaveText(["Mech room 110", "No pinned location"]);
  const captureGroups = page.getByTestId("ca-photo-group");
  await expect(captureGroups.nth(0).getByTestId("ca-photo-tile")).toHaveCount(2);
  await expect(captureGroups.nth(1).getByTestId("ca-photo-tile")).toHaveCount(1);
  // Groups collapse and expand, and stay as left after a reload.
  const pinToggle = captureGroups.nth(0).getByTestId("ca-photo-group-toggle");
  await pinToggle.click();
  await expect(pinToggle).toHaveAttribute("aria-expanded", "false");
  await expect(captureGroups.nth(0).getByTestId("ca-photo-tile")).toHaveCount(0);
  await page.reload();
  await expect(captureGroups.nth(0).getByTestId("ca-photo-group-toggle")).toHaveAttribute("aria-expanded", "false");
  await captureGroups.nth(0).getByTestId("ca-photo-group-toggle").click();
  await expect(captureGroups.nth(0).getByTestId("ca-photo-tile")).toHaveCount(2);
  await captureGroups.nth(0).getByRole("button", { name: "Open pin" }).click();
  await expect(page.getByTestId("ca-pin-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ca-pin-sheet")).toHaveCount(0);

  await openReportStep(page, "Report");
  await expect(page.getByTestId("ca-report-editor")).toBeVisible();
  const panel = page.getByTestId("ca-report-photo-panel");

  if (info.project.name === "phone") {
    // Phones use the photo boxes' menus; the side panel is for wide screens.
    await expect(panel).toBeHidden();
    return;
  }

  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("ca-panel-group-title")).toHaveText(["Mech room 110", "No pinned location"]);
  // Photos taken today, the report's default Date Visited.
  await expect(panel.getByRole("button", { name: "Visit day (3)" })).toHaveAttribute("aria-pressed", "true");

  const [pinGroup, looseGroup] = await panel.getByTestId("ca-panel-group").all();
  await page.getByRole("button", { name: "Add observation item" }).click();
  const item = page.getByTestId("ca-editor-item");

  // Select both pin photos, drag one: both land in the empty box.
  await item.getByTestId("ca-add-photo-box").first().scrollIntoViewIfNeeded();
  await pinGroup.getByRole("button", { name: "Select all" }).click();
  await expect(panel.getByTestId("ca-panel-selection")).toHaveText(/2 selected/);
  await pinGroup.getByTestId("ca-panel-photo").first().dragTo(item.getByTestId("ca-add-photo-box").first());
  await expect(item.locator(".photo.has")).toHaveCount(2);
  await expect(panel.getByTestId("ca-panel-selection")).toHaveCount(0);
  await expect(pinGroup.getByText("In report")).toHaveCount(2);

  // An unselected photo drags alone: onto the project photo box...
  // (Targets are scrolled into view first: a scroll mid-drag cancels it.)
  const loose = looseGroup.getByTestId("ca-panel-photo");
  await page.getByTestId("ca-cover-box").scrollIntoViewIfNeeded();
  await loose.dragTo(page.getByTestId("ca-cover-box"));
  await expect(page.getByTestId("ca-cover-box").locator("img")).toHaveCount(1);

  // ...and onto a filled box, where it replaces that photo.
  await item.locator(".photo.has").first().scrollIntoViewIfNeeded();
  await loose.dragTo(item.locator(".photo.has").first());
  await expect(item.locator(".photo.has")).toHaveCount(2);

  // Saved and synced: the project photo and the item's two photos, the
  // unpinned one first in place of the photo it was dropped on.
  const photos = (await (await page.request.get(`/api/ca/projects/${project}/photos`)).json()).photos as { id: string; pinId?: string }[];
  const unpinned = photos.find((p) => !p.pinId)!.id;
  await expect
    .poll(async () => {
      const { reports } = await (await page.request.get(`/api/ca/projects/${project}/reports`)).json();
      const draft = reports[0]?.draft;
      return draft && { cover: draft.coverPhotoId, items: draft.items[0]?.photos.map((p: { photoId: string }) => p.photoId === unpinned) };
    }, { timeout: 30_000 })
    .toEqual({ cover: unpinned, items: [true, false] });
  await waitSynced(page);
});

test("photo locations: grouped pages with captions and a zoomable floor plan", async ({ page }, info) => {
  const project = num("LOC", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);

  await importMockSheet(page);
  const pinSheet = await dropPinAt(page, 0.3, 0.4);
  await pinSheet.getByLabel("Pin label").fill("Mech room 110");
  await pinSheet.getByTestId("ca-library-input").setInputFiles([
    { name: "duct.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Duct") },
    { name: "valve.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Valve", "#4b5d4b") },
  ]);
  await expect(pinSheet.getByText("Photos at this pin (2)")).toBeVisible();
  await pinSheet.getByRole("button", { name: "Save pin" }).click();
  await expect(pinSheet).toHaveCount(0);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(2);

  // The report's two pinned photos become one item at that location.
  await openReportStep(page, "Report");
  await addCapturedPhotos(page, 2);
  await page.getByLabel("Item 001 photo 1 caption").fill("Duct at grid 5");

  // The location section: its photos with captions, and the floor plan.
  const location = page.getByTestId("ca-location");
  await expect(location).toHaveCount(1);
  await expect(location.getByTestId("ca-location-title")).toHaveText("Mech room 110");
  await expect(location.locator(".photo.has img")).toHaveCount(2);
  await expect(location.locator(".pcap").first()).toHaveText("Duct at grid 5");
  const plan = location.getByTestId("ca-location-plan");
  await expect(plan.locator("img")).toHaveCount(1);
  await expect(plan).toHaveAttribute("data-zoom", "1");
  const size = (await plan.boundingBox())!;

  // Click to zoom, zoom in twice, click outside: saved.
  await plan.scrollIntoViewIfNeeded();
  await plan.click();
  await plan.getByRole("button", { name: "Zoom in" }).click();
  await plan.getByRole("button", { name: "Zoom in" }).click();
  await expect(plan).toHaveAttribute("data-zoom", "2.25");
  await location.getByTestId("ca-location-title").click();
  await expect(plan.getByRole("button", { name: "Zoom in" })).toHaveCount(0);
  await expect(plan).toHaveAttribute("data-zoom", "2.25");
  // Same size whatever the zoom.
  expect((await plan.boundingBox())!.width).toBeCloseTo(size.width, 0);

  // Escape puts it back as it was.
  await plan.click();
  await plan.getByRole("button", { name: "Zoom out" }).click();
  await page.keyboard.press("Escape");
  await expect(plan).toHaveAttribute("data-zoom", "2.25");

  await expect
    .poll(async () => {
      const { reports } = await (await page.request.get(`/api/ca/projects/${project}/reports`)).json();
      return Object.values(reports[0]?.draft.locationZoom ?? {});
    }, { timeout: 30_000 })
    .toEqual([2.25]);
  await waitSynced(page);

  // The preview and the issued revision show it as saved.
  await page.getByRole("link", { name: "Preview / print draft" }).click();
  const doc = page.getByTestId("ca-report-document");
  await expect(doc.getByTestId("ca-location-plan")).toHaveAttribute("data-zoom", "2.25");
  await expect(doc.getByTestId("ca-location-plan").getByRole("button", { name: "Zoom in" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to report" }).click();

  await page.getByRole("button", { name: "Issue report" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue Rev 0" }).click();
  await expect(page).toHaveURL(/rev=0/);
  const issued = page.getByTestId("ca-report-document");
  await expect(issued.getByTestId("ca-location-title")).toHaveText("Mech room 110");
  await expect(issued.getByTestId("ca-location-plan")).toHaveAttribute("data-zoom", "2.25");
  await expect(issued.getByTestId("ca-location-plan").locator("img")).toHaveCount(1);
  await expect(issued.getByTestId("ca-location").locator(".photo.has img")).toHaveCount(2);
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
