import "server-only";

import {
  CaNotConfiguredError,
  type CaDrawingSource,
  type CaProjectSource,
  type CaSourceDrawing,
} from "@/lib/ca/contracts";
import { listVantagePointProjects } from "@/repositories/vantagepointRepository";
import type { CaSourceProject } from "@/types/ca";

/**
 * Upstream sources for CA projects and drawing sets.
 *
 * Only the mock and VantagePoint sources work today. The CA application
 * (parkhill-ccr) sources are deliberate stubs: how that system exposes
 * projects and decides which drawing set is the latest *approved* one has not
 * been confirmed, so nothing here guesses. See
 * docs/ca-integration-contracts.md for the questions to settle first.
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

/** Reuses the CX app's existing, read-only VantagePoint (Fabric) lookup. */
export const vantagePointProjectSource: CaProjectSource = {
  kind: "vantagepoint",
  async list() {
    const projects = await listVantagePointProjects();
    return projects.map((p) => ({
      projectNumber: p.projectNumber,
      name: p.name,
      source: "vantagepoint" as const,
    }));
  },
};

/** TODO(Marcelo): implement against the CA application's project API. */
export const caAppProjectSource: CaProjectSource = {
  kind: "ca-app",
  async list() {
    throw new CaNotConfiguredError(
      "The CA application project feed is not connected yet. Enter the project manually for now.",
    );
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

/** TODO(Marcelo): implement against the CA application's drawing API. */
export const caAppDrawingSource: CaDrawingSource = {
  kind: "ca-app",
  async listLatest() {
    throw new CaNotConfiguredError(
      "The CA application drawing feed is not connected yet. Upload the drawing manually for now.",
    );
  },
  async fetchFile() {
    throw new CaNotConfiguredError(
      "The CA application drawing feed is not connected yet.",
    );
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
