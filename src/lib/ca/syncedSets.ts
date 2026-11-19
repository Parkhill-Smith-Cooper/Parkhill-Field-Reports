import type { CaDrawing, CaDrawingSet, CaReportDrawingSet } from "@/types/ca";

/**
 * Drawing sets synced from the CA application's Document Control module.
 *
 * Ids are derived, never random: the server (on a push from ccr, or a
 * reconcile) and every device compute the same set id from ccr's version id,
 * and the same drawing id for each sheet of it. So concurrent pushes,
 * reconciles and devices can only ever converge on one record, and every PUT
 * stays idempotent. Shared by server and browser code; no Node APIs.
 */

const SET_PREFIX = "dcset_";
const SPEC_PREFIX = "dcspec_";
/** Leaves room for the `_p{page}` suffix within the 64-character id limit. */
const MAX_SET_ID = 56;

/** FNV-1a, 32-bit, as 8 hex digits. Only used to shorten an over-long ref. */
function fnv1a(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The set id for one version in the source (ccr's version id, e.g.
 * `<project id>-v3`). Readable when it fits; hashed when it does not.
 */
export function syncedSetId(externalRef: string): string {
  return derivedId(SET_PREFIX, externalRef);
}

/**
 * The record id for one specification section revision in the source
 * (ccr's revision id, e.g. `<project id>-spec-033000-r2`). Same rule as
 * `syncedSetId`, so a repeated sync converges on one record.
 */
export function syncedSpecSectionId(externalRef: string): string {
  return derivedId(SPEC_PREFIX, externalRef);
}

function derivedId(prefix: string, externalRef: string): string {
  const readable = `${prefix}${externalRef.replace(/[^A-Za-z0-9]/g, "_")}`;
  if (readable.length <= MAX_SET_ID) return readable;
  return `${prefix}${fnv1a(externalRef, 0x811c9dc5)}${fnv1a(externalRef, 0x01000193)}${fnv1a(externalRef, 0x9e3779b9)}`;
}

/** The drawing (rendered sheet image) id for one page of a synced set. */
export function syncedSheetDrawingId(setId: string, page: number): string {
  return `${setId}_p${page}`;
}

/** True for a set that came from the drawing source (not uploaded by hand). */
export function isSyncedSet(set: Pick<CaDrawingSet, "source" | "externalRef">): boolean {
  return Boolean(set.source && set.externalRef);
}

/**
 * The project's current synced set, as the server last heard from the
 * source. Never inferred from dates or version numbers.
 */
export function currentSyncedSet<T extends CaDrawingSet>(sets: T[]): T | null {
  return sets.find((s) => !s.removed && isSyncedSet(s) && s.isCurrent === true) ?? null;
}

/** What a report records about the set it uses. */
export function reportDrawingSet(set: CaDrawingSet): CaReportDrawingSet {
  return {
    setId: set.id,
    ...(set.revisionLabel ? { revisionLabel: set.revisionLabel } : {}),
    ...(set.title ? { title: set.title } : {}),
  };
}

/**
 * The drawings a report works with: the sheets of its own set plus drawings
 * added by hand outside any synced set. A report without a set (older
 * reports, projects with nothing in the CA app) sees every drawing, as before.
 */
export function drawingsForReport<D extends Pick<CaDrawing, "drawingSetId">>(
  drawings: D[],
  drawingSet: CaReportDrawingSet | undefined,
  syncedSetIds: ReadonlySet<string>,
): D[] {
  if (!drawingSet) return drawings;
  return drawings.filter(
    (d) => d.drawingSetId === drawingSet.setId || !d.drawingSetId || !syncedSetIds.has(d.drawingSetId),
  );
}
