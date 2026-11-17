import type { Page } from "@playwright/test";

import {
  createCaProject,
  makeJpeg,
  serverDrawings,
  serverPhotosWithPins,
  serverPins,
  waitForOfflineReady,
} from "./fixtures/ca";
import { expect, test } from "./fixtures/auth";

/**
 * Phase 3: drawings (import, PDF upload), pins with photos, offline pins, and
 * the Site Route tab with its Start Tracking placeholder.
 */

const num = (base: string, project: string) => `E2E-${base}-${project.toUpperCase()}`;
const path = (n: string, tab = "capture") => `/field-reports/${n}/${tab}`;

async function importMockSheet(page: Page, sheet = "A-101") {
  await page.getByRole("button", { name: "Add drawing" }).first().click();
  const dialog = page.getByRole("dialog");
  const row = dialog.getByTestId("ca-offered-drawings").locator("div", { hasText: sheet }).filter({ has: page.getByRole("button", { name: "Import" }) }).last();
  await row.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("ca-drawing-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Add drawing" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible();
}

/** Drops a pin at fractions of the sheet and returns the open pin sheet. */
async function dropPinAt(page: Page, fx: number, fy: number) {
  await page.getByRole("button", { name: "Drop pin" }).click();
  await expect(page.getByTestId("ca-drawing-viewer")).toHaveAttribute("data-drop-mode", "on");
  const sheet = page.getByTestId("ca-drawing-sheet");
  const box = (await sheet.boundingBox())!;
  await sheet.click({ position: { x: box.width * fx, y: box.height * fy } });
  const pinSheet = page.getByTestId("ca-pin-sheet");
  await expect(pinSheet).toBeVisible();
  return pinSheet;
}

test("import a sheet, drop a pin, take photos into it", async ({ page }, info) => {
  const project = num("PIN", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(path(project));

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
  await expect(page.getByTestId("ca-photo-pin")).toHaveText("Mech room 110");

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

test("upload a PDF and choose the floor-plan page", async ({ page, context }, info) => {
  const project = num("PDF", info.project.name);
  await createCaProject(page.request, project);

  // A real two-page PDF, made by the browser.
  const maker = await context.newPage();
  await maker.setContent(
    `<div style="height:4in;font:48px Arial;page-break-after:always">COVER SHEET</div>
     <div style="height:4in;border:6px solid #333;font:48px Arial">LEVEL 2 FLOOR PLAN</div>`,
  );
  const pdf = await maker.pdf({ format: "Letter", landscape: true });
  await maker.close();

  await page.goto(path(project));
  await page.getByRole("button", { name: "Add drawing" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("ca-drawing-input").setInputFiles({ name: "CD_Set.pdf", mimeType: "application/pdf", buffer: pdf });
  const pageSelect = dialog.getByTestId("ca-drawing-page");
  await expect(pageSelect).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("This PDF has 2 pages.", { exact: false })).toBeVisible();
  await pageSelect.selectOption("2");
  await dialog.getByLabel("Title").fill("Level 2 Floor Plan");
  await dialog.getByLabel("Sheet number").fill("A-102");
  await dialog.getByRole("button", { name: "Add drawing" }).click();

  await expect(page.getByTestId("ca-drawing-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("PDF page 2 of 2")).toBeVisible();
  expect(await serverDrawings(page.request, project)).toMatchObject([
    { title: "Level 2 Floor Plan", fileType: "pdf", page: 2, pageCount: 2, source: "upload" },
  ]);
});

test("offline: the drawing opens and pins dropped offline sync once", async ({ page, context }, info) => {
  const project = num("OPIN", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(path(project));
  await importMockSheet(page);
  await expect(page.getByText("Not saved for offline yet")).toHaveCount(0);
  await waitForOfflineReady(page);

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
  await page.goto(path(project));
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

  await page.getByRole("link", { name: "Site Route" }).click();
  const tracking = page.getByTestId("ca-tracking-placeholder");
  await expect(tracking.getByRole("button", { name: "Start Tracking" })).toBeDisabled();
  await expect(tracking).toContainText("Coming soon");

  const stops = page.getByTestId("ca-route-stops").getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(stops.nth(0)).toContainText("Library");
  await expect(stops.nth(1)).toContainText("Gym");
  await expect(page.getByTestId("ca-route-line")).toHaveCount(1);
  await expect(page.getByText("1 pin has no photos yet")).toBeVisible();
  await expect(page.getByTestId("ca-route-day").locator("option")).toHaveCount(2); // All dates + today
});
