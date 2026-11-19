import "server-only";

import {
  CaNotConfiguredError,
  isCaError,
  type CaDrawingSource,
  type CaProjectSource,
  type CaSourceDrawing,
} from "@/lib/ca/contracts";
import { azureCredential } from "@/lib/azure/credential";
import { ccrPaths, mapCcrDrawings } from "@/lib/ca/ccrDrawings";
import { archProjectNumberFromWbs, mapCcrProjects } from "@/lib/ca/ccrProjects";
import { caConfig } from "@/lib/ca/config";
import { listVantagePointProjects } from "@/repositories/vantagepointRepository";
import type { CaSourceProject } from "@/types/ca";

/**
 * Upstream sources for CA projects and drawing sets.
 *
 * Both come from the CA application (the parkhill-ccr backend): projects from
 * its project list, with VantagePoint as the fallback when it cannot be
 * reached; drawing sets from its Document Control module. See
 * docs/ca-integration-contracts.md.
 */

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** MOCK sample projects. Clearly labelled; not real Parkhill projects. */
const MOCK_PROJECTS: CaSourceProject[] = [
  {
    projectNumber: "MOCK-45371.25.01",
    name: "Elementary School 01 — New Construction (sample)",
    client: "Lubbock ISD (sample)",
    source: "mock",
    externalRef: "mock-ca-1001",
  },
  {
    projectNumber: "MOCK-51022.00",
    name: "Fire Station 7 — Renovation (sample)",
    client: "City of Midland (sample)",
    source: "mock",
    externalRef: "mock-ca-1002",
  },
  {
    projectNumber: "MOCK-60310.10",
    name: "County Courthouse — MEP Upgrade (sample)",
    client: "Ector County (sample)",
    source: "mock",
    externalRef: "mock-ca-1003",
  },
];

export const mockProjectSource: CaProjectSource = {
  kind: "mock",
  async list() {
    return MOCK_PROJECTS.map((p) => ({ ...p }));
  },
};

/**
 * Reuses the CX app's existing, read-only VantagePoint (Fabric) lookup. Numbers
 * are converted the way the CA application converts them, so a project picked
 * here matches the same project picked from the CA app.
 */
export const vantagePointProjectSource: CaProjectSource = {
  kind: "vantagepoint",
  async list() {
    const projects = await listVantagePointProjects();
    return projects.map((p) => ({
      projectNumber: archProjectNumberFromWbs(p.projectNumber),
      name: p.name,
      source: "vantagepoint" as const,
      externalRef: p.projectNumber,
    }));
  },
};

/** How long the CA application has to start answering (headers, not the whole body). */
const CA_APP_TIMEOUT_MS = 15_000;
const UNAVAILABLE = "The CA application could not be reached.";

/**
 * `GET {CA_APP_API_BASE_URL}{path}` with an app-only Entra token for
 * `CA_APP_API_SCOPE`. The ccr backend accepts such a token only because it
 * grants this app the `FieldReports.Read` app role, and only on its service
 * read routes.
 *
 * Throws `CaNotConfiguredError` when the connection is not configured;
 * otherwise returns the response, whatever its status. The timeout covers the
 * wait for the response, not reading its body, so a large drawing set can
 * stream for as long as it takes.
 */
async function ccrGet(path: string, accept: string): Promise<Response> {
  let url: string;
  let scope: string;
  try {
    url = `${caConfig.caAppApiBaseUrl}${path}`;
    scope = caConfig.caAppApiScope;
  } catch {
    throw new CaNotConfiguredError("The CA application is not configured (CA_APP_API_BASE_URL, CA_APP_API_SCOPE).");
  }
  const token = await azureCredential().getToken(scope);
  if (!token) throw new Error("No token for the CA application scope.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("The CA application did not answer in time.")), CA_APP_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token.token}`, Accept: accept },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Logs the detail on the server; the user sees `message` only. */
function unavailable(what: string, error: unknown, message = UNAVAILABLE): never {
  if (isCaError(error, "CaNotConfiguredError")) throw error;
  console.error(`[CA] CA application ${what} failed:`, error instanceof Error ? error.message : error);
  throw new CaNotConfiguredError(message);
}

/**
 * Projects from the CA application: `GET /api/projects`.
 *
 * Every failure (not configured, no token, 401/403, timeout, 5xx, bad body) is
 * a `CaNotConfiguredError`, which makes New Project fall back to VantagePoint.
 * Details are logged on the server, never shown to the user.
 */
export const caAppProjectSource: CaProjectSource = {
  kind: "ca-app",
  async list() {
    try {
      const response = await ccrGet(ccrPaths.projects(), "application/json");
      if (!response.ok) throw new Error(`CA application responded ${response.status}.`);
      return mapCcrProjects(await response.json());
    } catch (error) {
      unavailable("project list", error);
    }
  },
};

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

const MOCK_DRAWINGS: CaSourceDrawing[] = [
  {
    externalRef: "mock-sheet-a101",
    title: "Level 1 Floor Plan (sample)",
    sheetNumber: "A-101",
    revisionLabel: "MOCK 100% CD",
    isLatestApproved: true,
    fileType: "image",
    fileName: "A-101 Level 1 Floor Plan (sample).svg",
  },
  {
    externalRef: "mock-sheet-a102",
    title: "Level 2 Floor Plan (sample)",
    sheetNumber: "A-102",
    revisionLabel: "MOCK 100% CD",
    isLatestApproved: true,
    fileType: "image",
    fileName: "A-102 Level 2 Floor Plan (sample).svg",
  },
];

export const mockDrawingSource: CaDrawingSource = {
  kind: "mock",
  async listLatest() {
    return MOCK_DRAWINGS.map((d) => ({ ...d }));
  },
  async fetchFile(_projectNumber, externalRef) {
    const sheet = MOCK_DRAWINGS.find((d) => d.externalRef === externalRef);
    if (!sheet) throw new Error(`No mock drawing ${externalRef}.`);
    return {
      bytes: new TextEncoder().encode(mockFloorPlanSvg(sheet)),
      contentType: "image/svg+xml",
      fileName: sheet.fileName,
    };
  },
};

/**
 * The project's current drawing set from the CA application's Document
 * Control module (two service routes, see `ccrPaths`):
 *
 * - `listLatest`: `[]` or the current set. ccr says which set is current;
 *   nothing here infers it. A project the CA application does not have (404)
 *   simply has no drawings to offer.
 * - `fetchFile`: the set's PDF, streamed through without being buffered.
 *
 * Other failures are logged and become `CaNotConfiguredError` (503 with a
 * plain message); uploading a drawing set by hand still works.
 */
export const caAppDrawingSource: CaDrawingSource = {
  kind: "ca-app",
  async listLatest(projectNumber) {
    try {
      const response = await ccrGet(ccrPaths.latestDrawings(projectNumber), "application/json");
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`CA application responded ${response.status}.`);
      return mapCcrDrawings(await response.json());
    } catch (error) {
      unavailable("drawing list", error, "The CA application's drawings could not be loaded. You can still upload the drawing set.");
    }
  },
  async fetchFile(projectNumber, externalRef) {
    try {
      const response = await ccrGet(ccrPaths.drawingFile(projectNumber, externalRef), "application/pdf");
      if (!response.ok || !response.body) throw new Error(`CA application responded ${response.status}.`);
      return {
        bytes: response.body,
        contentType: "application/pdf",
        fileName: `${externalRef}.pdf`,
      };
    } catch (error) {
      unavailable("drawing file", error, "The drawing set could not be downloaded from the CA application.");
    }
  },
};

/** A simple, obviously-fake floor plan so the pin workflow can be exercised. */
function mockFloorPlanSvg(sheet: CaSourceDrawing): string {
  const rooms = [
    [40, 40, 300, 220, "CLASSROOM 101"],
    [340, 40, 300, 220, "CLASSROOM 102"],
    [640, 40, 320, 220, "LIBRARY"],
    [40, 340, 420, 240, "GYMNASIUM"],
    [460, 340, 220, 240, "MECH 110"],
    [680, 340, 280, 240, "ADMIN"],
  ] as const;
  const roomSvg = rooms
    .map(
      ([x, y, w, h, label]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#333" stroke-width="4"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2}" font-family="Arial" font-size="22" text-anchor="middle" fill="#555">${label}</text>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
<rect width="1000" height="700" fill="#f7f7f5"/>
${roomSvg}
<rect x="40" y="260" width="920" height="80" fill="#ecebe6" stroke="#333" stroke-width="2"/>
<text x="500" y="308" font-family="Arial" font-size="20" text-anchor="middle" fill="#777">CORRIDOR</text>
<text x="980" y="690" font-family="Arial" font-size="18" text-anchor="end" fill="#c8102e">MOCK DRAWING — ${sheet.sheetNumber ?? ""} ${sheet.title}</text>
</svg>`;
}
