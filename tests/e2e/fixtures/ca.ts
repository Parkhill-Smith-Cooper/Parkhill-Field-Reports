import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Helpers for CA browser tests (mock mode). */

/** Creates a CA project through the API, as the signed-in test user. */
export async function createCaProject(request: APIRequestContext, projectNumber: string, name = "E2E Project") {
  const response = await request.post("/api/ca/projects", {
    data: { projectNumber, name, client: "E2E Owner", source: "manual" },
  });
  if (response.status() !== 201 && response.status() !== 409) {
    throw new Error(`Could not create ${projectNumber}: ${response.status()} ${await response.text()}`);
  }
}

/** A real, decodable JPEG made by the browser itself (so downscaling works). */
export async function makeJpeg(page: Page, label: string, color = "#7a6a55"): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ label, color }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1200, 900);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 80px Arial";
      ctx.fillText(label, 60, 160);
      return canvas.toDataURL("image/jpeg", 0.85);
    },
    { label, color },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

export async function serverPhotos(request: APIRequestContext, projectNumber: string) {
  const response = await request.get(`/api/ca/projects/${encodeURIComponent(projectNumber)}/photos`);
  return ((await response.json()) as { photos: { id: string; caption: string }[] }).photos;
}

/**
 * Waits until the CA service worker is active and this very page (first
 * visit, no reload - the real engineer's path) is in its offline cache.
 */
export async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // expect.poll awaits the async check; waitForFunction would treat the
  // returned Promise itself as truthy and pass immediately.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            if (await (await caches.open(name)).match(location.href, { ignoreVary: true })) return true;
          }
          return false;
        }),
      { timeout: 45_000, intervals: [500] },
    )
    .toBe(true);
}

export async function serverPins(request: APIRequestContext, projectNumber: string) {
  const response = await request.get(`/api/ca/projects/${encodeURIComponent(projectNumber)}/pins`);
  return ((await response.json()) as { pins: { id: string; label: string; x: number; y: number; deleted?: boolean }[] }).pins;
}

export async function serverDrawings(request: APIRequestContext, projectNumber: string) {
  const response = await request.get(`/api/ca/projects/${encodeURIComponent(projectNumber)}/drawings`);
  return (
    (await response.json()) as {
      drawings: { id: string; title: string; fileType: string; page: number; pageCount: number; source: string }[];
    }
  ).drawings;
}

export async function serverPhotosWithPins(request: APIRequestContext, projectNumber: string) {
  const response = await request.get(`/api/ca/projects/${encodeURIComponent(projectNumber)}/photos`);
  return ((await response.json()) as { photos: { id: string; pinId?: string }[] }).photos;
}

/** Waits until a page (by path) is in the CA offline cache. */
export async function waitForCached(page: Page, path: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async (p) => {
          const url = new URL(p, location.origin).href;
          for (const name of await caches.keys()) {
            if (await (await caches.open(name)).match(url, { ignoreVary: true })) return true;
          }
          return false;
        }, path),
      { timeout: 45_000, intervals: [500] },
    )
    .toBe(true);
}
