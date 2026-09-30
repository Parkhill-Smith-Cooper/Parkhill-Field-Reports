/**
 * Sortable, collision-resistant ids. Timestamp-prefixed so that ids sort
 * chronologically as strings, which keeps Cosmos queries and blob listings in
 * a sensible order without a secondary index.
 */

function randomSuffix(): string {
  // crypto.getRandomValues is available in both the browser and Node 20+.
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function prefixedId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomSuffix()}`;
}

/** Id for an observation. Generated when the wizard starts, because the blob
 *  path for the first photo upload has to be final before Step 4 exists. */
export const newObservationId = () => prefixedId("obs");

/** Id for a single uploaded photo. */
export const newPhotoId = () => prefixedId("ph");

/** Id for a suggested or engineer-authored cause / corrective action. */
export const newItemId = () => prefixedId("item");
