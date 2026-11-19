import {
  createCaProject,
  dropPinAt,
  importMockSheet,
  makeJpeg,
  serverDrawings,
  serverPhotosWithPins,
  serverPins,
  caReportsPath,
  openReportStep,
  startCaReport,
  waitForCached,
} from "./fixtures/ca";
import type { APIRequestContext, BrowserContext, Locator } from "@playwright/test";

import { expect, signIn, test } from "./fixtures/auth";

/**
 * Phase 3: drawings (import, drawing-set upload with AI sheet names), pins with photos, offline pins, and
 * a report's Site Route step with its Start Tracking placeholder.
 */

const num = (base: string, project: string) => `E2E-${base}-${project.toUpperCase()}`;

test("import a sheet, drop a pin, take photos into it", async ({ page }, info) => {
  const project = num("PIN", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);

  await expect(page.getByText("No floor plans yet")).toBeVisible();
  await importMockSheet(page);
  await expect(page.getByText("MOCK", { exact: true }).first()).toBeVisible();
  expect(await serverDrawings(page.request, project)).toMatchObject([{ source: "mock", fileType: "image" }]);

  const pinSheet = await dropPinAt(page, 0.3, 0.4);
  await pinSheet.getByLabel("Pin label").fill("Mech room 110");

  const photo = await makeJpeg(page, "Duct penetration");
  await pinSheet.getByTestId("ca-library-input").setInputFiles({ name: "duct.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(pinSheet.getByText("Photos at this pin (1)")).toBeVisible();
  await pinSheet.getByRole("button", { name: "Save pin" }).click();
  await expect(pinSheet).toHaveCount(0);

  // On the drawing and in the photo grid.
  await expect(page.getByTestId("ca-pin")).toHaveCount(1);
  await expect(page.getByTestId("ca-pin")).toHaveAccessibleName(/Mech room 110, 1 photo/);
  // The Photos list groups the photo under its pin.
  await expect(page.getByTestId("ca-photo-group-title")).toHaveText(["Mech room 110"]);
  await expect(page.getByTestId("ca-photo-group").getByTestId("ca-photo-tile")).toHaveCount(1);

  // Synced once, with the photo filed under the pin.
  await expect(page.locator('[data-testid="ca-pin"][data-sync="synced"]')).toHaveCount(1);
  await expect.poll(async () => (await serverPins(page.request, project)).map((p) => p.label)).toEqual(["Mech room 110"]);
  const [pin] = await serverPins(page.request, project);
  expect(pin.x).toBeCloseTo(0.3, 1);
  expect(pin.y).toBeCloseTo(0.4, 1);
  await expect.poll(async () => (await serverPhotosWithPins(page.request, project)).map((p) => p.pinId)).toEqual([pin.id]);

  // Still there after a reload.
  await page.reload();
  await expect(page.getByTestId("ca-pin")).toHaveCount(1);
});

/** A real three-page drawing set, made by the browser, with a title block on each page. */
async function makeDrawingSet(context: BrowserContext): Promise<Buffer> {
  const sheet = (number: string, title: string, last = false) => `
    <div style="position:relative;height:7.9in;${last ? "" : "page-break-after:always"}">
      <div style="position:absolute;left:0.3in;top:2in;font:40px Arial">${title.toUpperCase()} DRAWING AREA</div>
      <div style="position:absolute;right:0.2in;bottom:0.2in;width:2.6in;border:2px solid #333;padding:6px;font:12px Arial">
        <div>SHEET TITLE</div>
        <div style="font:bold 18px Arial">${title.toUpperCase()}</div>
        <div>PROJECT NO. 45371.25.01</div>
        <div style="font:bold 40px Arial">${number}</div>
      </div>
    </div>`;
  const maker = await context.newPage();
  await maker.setContent(
    `<style>@page{margin:0}body{margin:0}</style>` +
      sheet("G-001", "Cover Sheet") +
      sheet("A-101", "Level 1 Floor Plan") +
      sheet("A-102", "Level 2 Floor Plan", true),
  );
  const pdf = await maker.pdf({ format: "Letter", landscape: true });
  await maker.close();
  return pdf;
}

const sheetRows = (dialog: Locator) => dialog.getByTestId("ca-set-sheet");

async function serverSets(request: APIRequestContext, projectNumber: string) {
  const response = await request.get(`/api/ca/projects/${encodeURIComponent(projectNumber)}/drawing-sets`);
  return (
    (await response.json()) as {
      sets: {
        id: string;
        fileName: string;
        source?: string;
        externalRef?: string;
        revisionLabel?: string;
        isCurrent?: boolean;
        indexed?: boolean;
        sheets: { page: number; sheetNumber: string; sheetName: string; naming: string }[];
      }[];
    }
  ).sets;
}

test("drawing set: stored on the server, named by AI, edited, and shared across devices", async ({ page, context, browser, baseURL }, info) => {
  const project = num("SET", info.project.name);
  await createCaProject(page.request, project);
  const pdf = await makeDrawingSet(context);

  // Device 1 uploads the set. Sheets are named by the MOCK reader
  // (CA_SHEET_NAMING=mock in playwright.config.ts): nothing reaches OpenAI.
  await startCaReport(page, project);
  await page.getByRole("button", { name: "Add drawing" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("ca-drawing-input")).toHaveAttribute("accept", /application\/pdf/);
  await dialog.getByTestId("ca-drawing-input").setInputFiles({ name: "CD Set.pdf", mimeType: "application/pdf", buffer: pdf });

  // Every page is a sheet, labelled <sheet number> - <sheet name>.
  await expect(sheetRows(dialog)).toHaveCount(3, { timeout: 30_000 });
  await expect(dialog.getByTestId("ca-set-sheet-label")).toHaveText(
    ["G-001 - Cover Sheet", "A-101 - Level 1 Floor Plan", "A-102 - Level 2 Floor Plan"],
    { timeout: 30_000 },
  );
  // Stored on the server: the PDF in the file store, the names on the set.
  await expect
    .poll(async () => (await serverSets(page.request, project))[0]?.sheets.map((s) => s.naming))
    .toEqual(["ai", "ai", "ai"]);

  // Correct a name.
  const third = sheetRows(dialog).nth(2);
  await third.getByRole("button", { name: /Edit name of/ }).click();
  await third.getByLabel("Sheet number").fill("A-102");
  await third.getByLabel("Sheet name").fill("Level 2 Floor Plan - East");
  await third.getByRole("button", { name: "Save name" }).click();
  await expect(third.getByTestId("ca-set-sheet-label")).toHaveText("A-102 - Level 2 Floor Plan - East");

  // Add it: rendered on this device and uploaded as a drawing, linked to the set.
  await third.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible();
  await expect(page.getByText("PDF page 3 of 3")).toBeVisible();
  await expect(page.getByTestId("ca-drawing-select").locator("option:checked")).toHaveText("A-102 - Level 2 Floor Plan - East");
  const [set] = await serverSets(page.request, project);
  expect(await serverDrawings(page.request, project)).toMatchObject([
    {
      title: "Level 2 Floor Plan - East",
      sheetNumber: "A-102",
      fileType: "pdf",
      page: 3,
      pageCount: 3,
      source: "upload",
      drawingSetId: set.id,
    },
  ]);

  // Device 2: a separate browser with nothing stored. Same set, same names,
  // and its sheets render from the stored PDF.
  const other = await browser.newContext({ ...info.project.use });
  await signIn(other, baseURL!);
  const second = await other.newPage();
  await startCaReport(second, project);
  await second.getByRole("button", { name: "Add drawing" }).first().click();
  const otherDialog = second.getByRole("dialog");
  await expect(otherDialog.getByTestId("ca-set-sheet-label")).toHaveText([
    "G-001 - Cover Sheet",
    "A-101 - Level 1 Floor Plan",
    "A-102 - Level 2 Floor Plan - East",
  ]);
  await expect(sheetRows(otherDialog).nth(2).getByRole("button", { name: "Added" })).toBeDisabled();
  await sheetRows(otherDialog).nth(1).getByRole("button", { name: "Add" }).click();
  await expect(second.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect(second.getByText("PDF page 2 of 3")).toBeVisible();
  await other.close();
  await expect.poll(async () => (await serverDrawings(page.request, project)).map((d) => d.page).sort()).toEqual([2, 3]);
});

test("the CA application's drawing set syncs on its own: a new report opens on its sheets", async ({ page }, info) => {
  // MOCK Document Control has published v1 for projects numbered DC-…
  const project = `DC-${num("SYNC", info.project.name)}`;
  await createCaProject(page.request, project);
  await startCaReport(page, project);

  // No "Add drawing" needed: the report is on the CA application's current set,
  // every sheet is listed, and the first floor plan opens.
  await expect(page.getByTestId("ca-report-drawing-set")).toContainText("v1 — 100% CD (MOCK)", { timeout: 30_000 });
  await expect(page.getByText("No floor plans yet")).toHaveCount(0);
  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible({ timeout: 45_000 });
  const select = page.getByTestId("ca-drawing-select");
  await expect(select.locator("option")).toHaveText(
    ["A-101 - Level 1 Floor Plan (Mock)", "A-102 - Level 2 Floor Plan (Mock)", "A-103 - Roof Plan (Mock)"],
    { timeout: 30_000 },
  );

  // The server copied the PDF into the Field Reports store and listed it as current.
  const [set] = await serverSets(page.request, project);
  expect(set).toMatchObject({ source: "mock", revisionLabel: "v1 — 100% CD (MOCK)", isCurrent: true, indexed: true });
  expect(set.id).toMatch(/^dcset_/);
  // An opened sheet is a drawing, with an id from its set and page (the same on every device).
  await expect
    .poll(async () => (await serverDrawings(page.request, project)).map((d) => [d.id, d.drawingSetId]))
    .toEqual([[`${set.id}_p1`, set.id]]);

  // Another sheet opens when chosen.
  const roof = await select.locator("option", { hasText: "A-103" }).getAttribute("value");
  await select.selectOption(roof!);
  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await serverDrawings(page.request, project)).length).toBe(2);

  // Pins work as on any drawing.
  await (await dropPinAt(page, 0.4, 0.4)).getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await serverPins(page.request, project)).length).toBe(1);

  // The dialog shows the set as synced; nothing to import.
  await page.getByRole("button", { name: "Add drawing" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("ca-offered-set-status")).toHaveText("Synced");
  await expect(dialog.getByTestId("ca-check-drawing-updates")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // The printed report says which drawing set it was made with.
  await openReportStep(page, "Report");
  await expect(page.getByTestId("ca-report-drawing-set-label")).toHaveText("v1 — 100% CD (MOCK)");

  // The push from the CA application is refused without its own credentials
  // (not configured here at all).
  const push = await page.request.post("/api/ca/integrations/ccr/drawing-sets", {
    data: { projectNumber: project, event: "published" },
  });
  expect(push.status()).toBe(503);

  // An origin from a source that is not configured is refused.
  const refused = await page.request.put(`/api/ca/projects/${project}/drawing-sets/caset_e2e_wrong_source`, {
    data: {
      fileName: "set.pdf",
      blockCount: 1,
      pageCount: 1,
      sheets: [{ page: 1, sheetNumber: "", sheetName: "", naming: "guess" }],
      source: "ca-app",
      externalRef: "v9",
    },
  });
  expect(refused.status()).toBe(400);
});

test("drawing set without AI: guesses are kept, sheets named by hand, set removed", async ({ page, context }, info) => {
  const project = num("SETNOAI", info.project.name);
  await createCaProject(page.request, project);
  const pdf = await makeDrawingSet(context);
  await page.route("**/drawing-sets/*/sheet-names", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Automatic sheet naming is not set up. Enter the sheet numbers and names yourself." },
    }),
  );

  await startCaReport(page, project);
  await page.getByRole("button", { name: "Add drawing" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("ca-drawing-input").setInputFiles({ name: "CD Set.pdf", mimeType: "application/pdf", buffer: pdf });

  await expect(dialog.getByTestId("ca-set-naming")).toContainText("Automatic sheet naming is not set up", { timeout: 30_000 });
  // The sheet numbers were still read from the title blocks on the device.
  await expect(dialog.getByTestId("ca-set-sheet-label")).toHaveText(["G-001", "A-101", "A-102"]);

  const row = sheetRows(dialog).nth(1);
  await row.getByRole("button", { name: /Edit name of/ }).click();
  await row.getByLabel("Sheet name").fill("Level 1 Floor Plan");
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(row.getByTestId("ca-set-sheet-label")).toHaveText("A-101 - Level 1 Floor Plan");
  await expect
    .poll(async () => (await serverSets(page.request, project))[0]?.sheets[1])
    .toMatchObject({ sheetName: "Level 1 Floor Plan", naming: "edited" });

  // Removed from the project for everyone.
  await dialog.getByRole("button", { name: "Drawing set options" }).click();
  await page.getByRole("menuitem", { name: "Remove set from the project" }).click();
  await expect(sheetRows(dialog)).toHaveCount(0);
  await expect.poll(async () => (await serverSets(page.request, project)).length).toBe(0);
});

test("drawing set upload refuses a file that is not a PDF", async ({ page }, info) => {
  const project = num("SETBAD", info.project.name);
  await createCaProject(page.request, project);
  const base = `/api/ca/projects/${project}/drawing-sets/caset_bad`;
  const block = await page.request.put(`${base}/blocks/0`, {
    multipart: { block: { name: "block-0", mimeType: "application/octet-stream", buffer: Buffer.from("not a pdf") } },
  });
  expect(block.status()).toBe(415);
  const commit = await page.request.put(base, {
    data: { fileName: "set.pdf", blockCount: 1, pageCount: 1, sheets: [{ page: 1, sheetNumber: "", sheetName: "", naming: "guess" }] },
  });
  expect(commit.status()).toBe(422);
  expect(await serverSets(page.request, project)).toEqual([]);
});

test("offline: the drawing opens and pins dropped offline sync once", async ({ page, context }, info) => {
  const project = num("OPIN", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);
  await importMockSheet(page);
  await expect(page.getByText("Not saved for offline yet")).toHaveCount(0);
  await waitForCached(page, caReportsPath(project));

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible();
  // The sheet image comes from the device, not the network.
  await expect
    .poll(() => page.getByTestId("ca-drawing-sheet").locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.src.startsWith("blob:")))
    .toBe(true);

  const pinSheet = await dropPinAt(page, 0.7, 0.6);
  await pinSheet.getByRole("button", { name: "Done" }).click();
  await expect(page.locator('[data-testid="ca-pin"][data-sync="pending"]')).toHaveCount(1);
  await expect(page.getByTestId("ca-sync-status")).toHaveText(/Offline — 1 item saved on this device/);

  await context.setOffline(false);
  await expect(page.locator('[data-testid="ca-pin"][data-sync="synced"]')).toHaveCount(1, { timeout: 30_000 });
  expect(await serverPins(page.request, project)).toHaveLength(1);
});

test("site route orders stops by photo time; tracking is a disabled placeholder", async ({ page }, info) => {
  const project = num("ROUTE", info.project.name);
  await createCaProject(page.request, project);
  await startCaReport(page, project);
  await importMockSheet(page);

  for (const [label, fx, fy] of [["Library", 0.8, 0.2], ["Gym", 0.2, 0.7]] as const) {
    const pinSheet = await dropPinAt(page, fx, fy);
    await pinSheet.getByLabel("Pin label").fill(label);
    await pinSheet.getByTestId("ca-library-input").setInputFiles({ name: `${label}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, label) });
    await expect(pinSheet.getByText("Photos at this pin (1)")).toBeVisible();
    await pinSheet.getByRole("button", { name: "Save pin" }).click();
    await expect(pinSheet).toHaveCount(0);
  }
  // A pin without photos is not a stop.
  await (await dropPinAt(page, 0.5, 0.5)).getByRole("button", { name: "Done" }).click();

  await openReportStep(page, "Site Route");
  const tracking = page.getByTestId("ca-tracking-placeholder");
  await expect(tracking.getByRole("button", { name: "Start Tracking" })).toBeDisabled();
  await expect(tracking).toContainText("Coming soon");

  const stops = page.getByTestId("ca-route-stops").getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(stops.nth(0)).toContainText("Library");
  await expect(stops.nth(1)).toContainText("Gym");
  await expect(page.getByTestId("ca-route-line")).toHaveCount(1);
  await expect(page.getByText("1 pin has no photos in this report")).toBeVisible();
  await expect(page.getByTestId("ca-route-day").locator("option")).toHaveCount(2); // All dates + today
});
