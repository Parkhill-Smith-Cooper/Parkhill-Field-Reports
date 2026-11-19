/**
 * Ids for CA records.
 *
 * Generated on the device for anything that can be created offline (photos,
 * pins, reports, items). A record keeps the same id from the moment it is
 * captured to the moment it is stored, which is what lets every sync write be
 * an idempotent PUT: retrying an upload can never create a second copy.
 *
 * Same shape as `src/lib/ids.ts` (timestamp-prefixed, so ids sort
 * chronologically) and accepted by `isValidGeneratedId`.
 */

function randomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function prefixedId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomSuffix()}`;
}

export const newCaPhotoId = () => prefixedId("caph");
export const newCaPinId = () => prefixedId("capin");
export const newCaReportId = () => prefixedId("carep");
export const newCaItemId = () => prefixedId("caitem");
export const newCaDrawingId = () => prefixedId("cadwg");
export const newCaSheetSetId = () => prefixedId("caset");
