import type { Page } from "@playwright/test";

import type { Project, SavedObservation } from "../../../src/types";

/**
 * Fixture responses for the CX API, so the CX regression checks exercise the
 * real CX pages without the dev server ever touching Cosmos, Blob, Fabric or
 * OpenAI.
 *
 * A catch-all is registered first: any non-CA `/api/*` call that has no
 * fixture fails loudly (HTTP 599) instead of reaching the server. Playwright
 * gives later routes precedence, so the specific fixtures below win.
 */

export const CX_PROJECT: Project = {
  id: "24-1057",
  projectNumber: "24-1057",
  name: "Midland ISD Natatorium (fixture)",
  createdAt: "2026-09-02T14:33:00.000Z",
  createdBy: "fixture@parkhill.com",
  updatedAt: "2026-09-02T14:33:00.000Z",
};

export const CX_OBSERVATION: SavedObservation = {
  id: "obs_fixture_1",
  projectNumber: "24-1057",
  equipment: "AHU-3",
  system: "Air handling",
  location: "Penthouse mechanical room 2",
  activity: "Functional performance test",
  observation:
    "Supply fan ramps to full speed and holds there regardless of the duct static pressure setpoint",
  observedDate: "2026-10-28",
  photos: [],
  causes: [{ id: "item_c1", text: "Static pressure sensor out of calibration", isCustom: false }],
  actions: [{ id: "item_a1", text: "Recalibrate the duct static sensor", isCustom: false }],
  status: "final",
  createdAt: "2026-10-28T15:00:00.000Z",
  createdBy: "fixture@parkhill.com",
  updatedAt: "2026-10-28T15:00:00.000Z",
};

export async function mockCxApi(page: Page) {
  await page.route(/\/api\/(?!ca\/)/, (route) =>
    route.fulfill({
      status: 599,
      contentType: "application/json",
      body: JSON.stringify({ error: `Unmocked CX API call in tests: ${route.request().url()}` }),
    }),
  );

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/projects", (route) =>
    route.fulfill(json({ projects: [CX_PROJECT] })),
  );
  await page.route(`**/api/projects/${CX_PROJECT.projectNumber}`, (route) =>
    route.fulfill(json({ project: CX_PROJECT })),
  );
  await page.route(`**/api/projects/${CX_PROJECT.projectNumber}/observations`, (route) =>
    route.fulfill(json({ observations: [CX_OBSERVATION] })),
  );
  await page.route(
    `**/api/projects/${CX_PROJECT.projectNumber}/observations/${CX_OBSERVATION.id}`,
    (route) => route.fulfill(json({ observation: CX_OBSERVATION })),
  );
  await page.route(`**/api/projects/${CX_PROJECT.projectNumber}/photos/sas`, (route) =>
    route.fulfill(json({ urls: {} })),
  );
  await page.route("**/api/vantagepoint-projects", (route) =>
    route.fulfill(json({ projects: [] })),
  );
}
