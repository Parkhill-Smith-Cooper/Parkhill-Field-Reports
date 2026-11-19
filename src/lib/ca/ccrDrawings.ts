import type { CaSourceDrawing } from "@/lib/ca/contracts";

/**
 * Mapping from the CA application's Document Control module (parkhill-ccr
 * `backend/routes/documentControl.js`) to drawings offered here. Kept free of
 * I/O so it can be tested with recorded samples.
 *
 * `GET /api/document-control/service/projects/number/{n}/latest` returns `[]`
 * or one item, the project's current drawing set (`toServiceDrawing`):
 *
 * - `externalRef`       the version id, `<ccr project id>-v<n>`
 * - `title`             the set's label, e.g. "100% CD"
 * - `revisionLabel`     "v<n> — <label>"
 * - `isLatestApproved`  always true: ccr only returns the current set
 * - `fileType`          "pdf"
 * - `fileName`, `size`  the PDF's name and size in bytes
 *
 * The whole set is one PDF; it is imported as a drawing set, whose pages are
 * then listed as sheets.
 */

const MAX_REF = 300;
const MAX_TITLE = 200;
const MAX_REVISION = 120;
const MAX_FILE_NAME = 260;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function mapCcrDrawings(body: unknown): CaSourceDrawing[] {
  if (!Array.isArray(body)) {
    throw new Error("The CA application returned an unexpected drawing list.");
  }
  const offers: CaSourceDrawing[] = [];
  for (const raw of body as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const externalRef = typeof raw.externalRef === "string" ? raw.externalRef.trim() : "";
    // Only PDFs: a drawing set is one PDF. Anything else is not offered.
    if (!externalRef || externalRef.length > MAX_REF || raw.fileType !== "pdf") continue;
    const revisionLabel = text(raw.revisionLabel, MAX_REVISION);
    const fileName = text(raw.fileName, MAX_FILE_NAME);
    offers.push({
      externalRef,
      title: text(raw.title, MAX_TITLE) || "Drawing set",
      ...(revisionLabel ? { revisionLabel } : {}),
      // As the CA application states it, never inferred.
      isLatestApproved: raw.isLatestApproved === true,
      fileType: "pdf",
      fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName || "Drawing set"}.pdf`,
      ...(typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size > 0 ? { sizeBytes: raw.size } : {}),
    });
  }
  return offers;
}

/** ccr's service paths, relative to `CA_APP_API_BASE_URL`. */
export const ccrPaths = {
  projects: () => "/api/projects",
  latestDrawings: (projectNumber: string) =>
    `/api/document-control/service/projects/number/${encodeURIComponent(projectNumber)}/latest`,
  drawingFile: (projectNumber: string, versionId: string) =>
    `/api/document-control/service/projects/number/${encodeURIComponent(projectNumber)}/versions/${encodeURIComponent(versionId)}/file`,
};
