import { createCaProject, makeJpeg, serverPhotos, waitForOfflineReady } from "./fixtures/ca";
import { mockCxApi } from "./fixtures/cxApi";
import { expect, test } from "./fixtures/auth";

/**
 * Phase 2: photo capture, captions, sync status, and offline capture that
 * survives a reload and syncs without duplicates.
 */

const num = (base: string, project: string) => `E2E-${base}-${project.toUpperCase()}`;
const capturePath = (n: string) => `/field-reports/${n}/capture`;

test("choose photos: saved, synced once, captioned", async ({ page }, info) => {
  const project = num("CAP", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(capturePath(project));

  const a = await makeJpeg(page, "Area B columns");
  const b = await makeJpeg(page, "Beam connections", "#5c6670");
  await page.getByTestId("ca-library-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: a },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: b },
  ]);

  const tiles = page.getByTestId("ca-photo-tile");
  await expect(tiles).toHaveCount(2);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(2);
  await expect(page.getByTestId("ca-sync-status")).toHaveText(/All synced/);
  expect(await serverPhotos(page.request, project)).toHaveLength(2);

  // Caption: saved on the device, then synced.
  await tiles.first().click();
  await page.getByRole("dialog").getByLabel("Caption").fill("Area B columns, gridline 5");
  await page.getByRole("dialog").getByRole("button", { name: "Save caption" }).click();
  await expect(page.getByText("Area B columns, gridline 5")).toBeVisible();
  await expect
    .poll(async () => (await serverPhotos(page.request, project)).map((p) => p.caption))
    .toContain("Area B columns, gridline 5");
});

test("offline capture survives a reload and syncs exactly once", async ({ page, context }, info) => {
  const project = num("OFF", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(capturePath(project));
  await expect(page.getByTestId("ca-sync-status")).toBeVisible();
  await waitForOfflineReady(page);
  await expect(page.getByTestId("ca-sync-status")).toBeVisible();

  const photo = await makeJpeg(page, "Taken offline", "#4b5d4b");
  await context.setOffline(true);

  await page.getByTestId("ca-library-input").setInputFiles({ name: "offline.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="pending"]')).toHaveCount(1);
  await expect(page.getByTestId("ca-sync-status")).toHaveText(/Offline — 1 item saved on this device/);

  // Close and reopen with no signal: the app shell loads from the service
  // worker and the photo is still there, still waiting.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Project sections" })).toBeVisible();
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="pending"]')).toHaveCount(1);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // Signal returns: it uploads on its own, once.
  await context.setOffline(false);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId("ca-sync-status")).toHaveText(/All synced/);
  expect(await serverPhotos(page.request, project)).toHaveLength(1);

  // A manual "sync" afterwards must not create a second copy.
  await page.getByTestId("ca-sync-status").click();
  await page.waitForTimeout(500);
  expect(await serverPhotos(page.request, project)).toHaveLength(1);
});

test("the offline service worker never controls CX pages", async ({ page }, info) => {
  const project = num("SW", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(capturePath(project));
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await mockCxApi(page);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
});

test("rapid capture takes several photos without leaving the app", async ({ page }, info) => {
  const project = num("RAP", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(capturePath(project));

  await page.getByRole("button", { name: "Rapid capture" }).click();
  const shutter = page.getByTestId("ca-rapid-shutter");
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(page.getByTestId("ca-rapid-count")).toHaveText("1 photo");
  await shutter.click();
  await expect(page.getByTestId("ca-rapid-count")).toHaveText("2 photos");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByTestId("ca-photo-tile")).toHaveCount(2);
  await expect.poll(async () => (await serverPhotos(page.request, project)).length).toBe(2);
});

test("delete a photo: gone from the project, synced as a deletion", async ({ page }, info) => {
  const project = num("DEL", info.project.name);
  await createCaProject(page.request, project);
  await page.goto(capturePath(project));
  await page.getByTestId("ca-library-input").setInputFiles([
    { name: "keep.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Keep") },
    { name: "oops.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "Oops", "#5c6670") },
  ]);
  await expect(page.locator('[data-testid="ca-photo-tile"][data-sync="synced"]')).toHaveCount(2);

  await page.getByRole("button", { name: /Photo oops\.jpg/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Delete photo" }).click();
  await sheet.getByTestId("ca-photo-delete-confirm").getByRole("button", { name: "Delete photo" }).click();
  await expect(page.getByTestId("ca-photo-tile")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Photo keep\.jpg/ })).toBeVisible();

  // The server keeps a tombstone (issued reports keep their copy); the app hides it.
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/ca/projects/${project}/photos`);
      const { photos } = (await res.json()) as { photos: { fileName: string; deleted?: boolean }[] };
      return photos.filter((p) => p.deleted).map((p) => p.fileName);
    })
    .toEqual(["oops.jpg"]);
  await page.reload();
  await expect(page.getByTestId("ca-photo-tile")).toHaveCount(1);
});
