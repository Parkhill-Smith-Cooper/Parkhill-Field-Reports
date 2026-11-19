import type { CaSourceSpecSection } from "@/lib/ca/contracts";

/**
 * Mapping from the CA application's Document Control specifications
 * (parkhill-ccr `backend/routes/specifications.js`) to sections offered here.
 * Kept free of I/O so it can be tested with recorded samples.
 *
 * `GET /api/document-control/specifications/service/projects/number/{n}/latest`
 * returns the current revision of every section (`toServiceSpecSection`):
 *
 * - `externalRef`      the revision id, `<ccr project id>-spec-<sectionKey>-r<n>`
 * - `sectionKey`       digits of the CSI number, "033000" or "033500.13"
 * - `sectionNumber`    display form, "03 30 00"
 * - `division`         "03"
 * - `title`, `revision`, `revisionLabel` ("Rev 02 — Addendum 2")
 * - `isLatestApproved` always true: ccr only returns current revisions
 * - `fileType`         "pdf"; `fileName`, `size`, `uploadedAt`
 */

const MAX_REF = 300;
const MAX_TITLE = 200;
const MAX_REVISION = 160;
const MAX_FILE_NAME = 260;
const SECTION_KEY = /^\d{6}(?:\.\d{2})?$/;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function mapCcrSpecSections(body: unknown): CaSourceSpecSection[] {
  if (!Array.isArray(body)) {
    throw new Error("The CA application returned an unexpected specification list.");
  }
  const offers: CaSourceSpecSection[] = [];
  const seen = new Set<string>();
  for (const raw of body as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    const externalRef = text(raw.externalRef, MAX_REF + 1);
    const sectionKey = text(raw.sectionKey, 12);
    const revision = raw.revision;
    if (!externalRef || externalRef.length > MAX_REF || raw.fileType !== "pdf") continue;
    if (!SECTION_KEY.test(sectionKey) || !Number.isInteger(revision) || (revision as number) < 1) continue;
    // One current revision per section; a repeat is ignored rather than guessed between.
    if (seen.has(sectionKey)) continue;
    seen.add(sectionKey);
    const revisionLabel = text(raw.revisionLabel, MAX_REVISION);
    const fileName = text(raw.fileName, MAX_FILE_NAME);
    const uploadedAt = text(raw.uploadedAt, 40);
    offers.push({
      externalRef,
      sectionKey,
      sectionNumber: text(raw.sectionNumber, 20) || sectionKey,
      division: sectionKey.slice(0, 2),
      title: text(raw.title, MAX_TITLE) || "Specification section",
      revision: revision as number,
      ...(revisionLabel ? { revisionLabel } : {}),
      // As the CA application states it, never inferred.
      isLatestApproved: raw.isLatestApproved === true,
      fileType: "pdf",
      fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName || sectionKey}.pdf`,
      ...(typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size > 0 ? { sizeBytes: raw.size } : {}),
      ...(uploadedAt ? { uploadedAt } : {}),
    });
  }
  return offers;
}

/** ccr's specification service paths, relative to `CA_APP_API_BASE_URL`. */
export const ccrSpecPaths = {
  latest: (projectNumber: string) =>
    `/api/document-control/specifications/service/projects/number/${encodeURIComponent(projectNumber)}/latest`,
  file: (projectNumber: string, revisionId: string) =>
    `/api/document-control/specifications/service/projects/number/${encodeURIComponent(projectNumber)}/revisions/${encodeURIComponent(revisionId)}/file`,
};
