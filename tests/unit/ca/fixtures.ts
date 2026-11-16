import { emptyReportContent } from "@/lib/ca/reportContent";
import type { CaPhoto, CaPin, CaReport } from "@/types/ca";

export const PROJECT = "MOCK-45371.25.01";

export function photo(id: string, overrides: Partial<CaPhoto> = {}): CaPhoto {
  return {
    id,
    projectNumber: PROJECT,
    filePath: `${PROJECT}/photos/${id}.jpg`,
    fileName: `${id}.jpg`,
    caption: "",
    takenAt: "2026-07-14T14:30:00.000Z",
    createdBy: "engineer@parkhill.com",
    createdAt: "2026-07-14T14:30:00.000Z",
    clientUpdatedAt: "2026-07-14T14:30:00.000Z",
    ...overrides,
  };
}

export function pin(id: string, overrides: Partial<CaPin> = {}): CaPin {
  return {
    id,
    projectNumber: PROJECT,
    drawingId: "cadwg_1",
    x: 0.5,
    y: 0.5,
    label: "",
    note: "",
    photoIds: [],
    createdAt: "2026-07-14T14:30:00.000Z",
    createdBy: "engineer@parkhill.com",
    clientUpdatedAt: "2026-07-14T14:30:00.000Z",
    ...overrides,
  };
}

export function reportInput(id = "carep_1"): Omit<CaReport, "reportNumber"> {
  return {
    id,
    projectNumber: PROJECT,
    draft: emptyReportContent(
      { name: "Elementary School 01", projectNumber: PROJECT, client: "Lubbock ISD" },
      "Brett Rodgers",
      new Date(2026, 6, 14, 9, 30),
    ),
    latestRevision: null,
    hasUnissuedChanges: false,
    createdAt: "2026-07-14T14:30:00.000Z",
    createdBy: "engineer@parkhill.com",
    updatedAt: "2026-07-14T14:30:00.000Z",
  };
}
