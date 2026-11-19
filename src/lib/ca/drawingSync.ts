import "server-only";

import type { CaDrawingSource, CaFileStore, CaRepository, CaSourceDrawing } from "@/lib/ca/contracts";
import { blocksOf } from "@/lib/ca/blocks";
import { caDrawingSetPath } from "@/lib/ca/paths";
import { createReconcileScheduler, RECONCILE_INTERVAL_MS } from "@/lib/ca/reconcileScheduler";
import { MAX_SET_BLOCKS, SET_BLOCK_BYTES } from "@/lib/ca/sheetIndex";
import { isSyncedSet, syncedSetId } from "@/lib/ca/syncedSets";
import type { CaDrawingSet } from "@/types/ca";

/**
 * Keeps each project's drawing set in step with the CA application's
 * Document Control module, on the server, in our own file store.
 *
 * `reconcile` is the whole algorithm. It asks the source (ccr `/latest`)
 * which set is current, copies that version's PDF into the CA file store
 * if it is not there yet, and marks it current. Every other synced set,
 * and its sheets, is marked superseded. Nothing is ever deleted: reports
 * made with an older version keep using it.
 *
 * It runs when ccr pushes a change (`POST /api/ca/integrations/ccr/drawing-sets`),
 * when a project's drawing sets are listed (at most every few minutes), and
 * when a project is set up. ccr says which set is current; nothing here
 * infers it from dates or version numbers.
 *
 * The PDF is stored, not read: the server has no PDF tooling, so the first
 * device to open the set lists its pages as sheets (`indexed: false` until then).
 */

export type DrawingSyncDeps = {
  repo: CaRepository;
  files: CaFileStore;
  source: CaDrawingSource | null;
  now?: () => Date;
};

export type ReconcileResult =
  | { status: "no-source" | "no-project" }
  | { status: "none" }
  | { status: "current"; setId: string; ingested: boolean };

export const SYNCED_BY = "CA application (Document Control)";

export { RECONCILE_INTERVAL_MS };

/** The set the source offers as current: a PDF it marks latest approved. */
export function currentOffer(offers: CaSourceDrawing[]): CaSourceDrawing | null {
  return offers.find((o) => o.fileType === "pdf" && o.isLatestApproved) ?? null;
}

/**
 * Copies one version's PDF into the CA file store and records the set.
 * Idempotent: the set id comes from the version id, the file and the record
 * are both create-only, so a repeat (or a race) changes nothing.
 */
export async function ingestSet(
  deps: DrawingSyncDeps,
  projectNumber: string,
  offer: CaSourceDrawing,
): Promise<{ set: CaDrawingSet; ingested: boolean }> {
  const { repo, files, source } = deps;
  if (!source) throw new Error("No drawing source is configured.");
  const now = (deps.now ?? (() => new Date()))().toISOString();

  // Already here: synced earlier, or imported by hand before syncing existed.
  const existing = (await repo.drawingSets.list(projectNumber)).find(
    (s) => !s.removed && s.source === source.kind && s.externalRef === offer.externalRef,
  );
  if (existing) return { set: existing, ingested: false };

  const id = syncedSetId(offer.externalRef);
  const stored = await repo.drawingSets.get(projectNumber, id);
  if (stored) {
    // Removed by hand in Field Reports, then still current in the CA app:
    // bring it back, since the CA app is the source of truth.
    const back = await repo.drawingSets.update(projectNumber, id, (s) => {
      const restored = { ...s, removed: false };
      delete restored.removedAt;
      delete restored.removedBy;
      return restored;
    });
    return { set: back ?? stored, ingested: false };
  }

  const filePath = caDrawingSetPath(projectNumber, id);
  let blockCount = 0;
  // Present when an earlier attempt stored the PDF but stopped before recording the set.
  if (!(await files.exists(filePath))) {
    const file = await source.fetchFile(projectNumber, offer.externalRef);
    for await (const block of blocksOf(file.bytes)) {
      if (blockCount === 0 && new TextDecoder().decode(block.subarray(0, 5)) !== "%PDF-") {
        throw new Error(`The CA application's file for ${offer.externalRef} is not a PDF.`);
      }
      if (blockCount >= MAX_SET_BLOCKS) {
        throw new Error(`The drawing set ${offer.externalRef} is larger than ${(MAX_SET_BLOCKS * SET_BLOCK_BYTES) >> 20} MB.`);
      }
      await files.stageBlock(filePath, blockCount, block);
      blockCount += 1;
    }
    if (blockCount === 0) throw new Error(`The CA application's file for ${offer.externalRef} is empty.`);
  }
  const { sizeBytes } = await files.commitBlocks(filePath, Math.max(blockCount, 1), "application/pdf");

  const set = await repo.drawingSets.create({
    id,
    projectNumber,
    fileName: offer.fileName || `${offer.title}.pdf`,
    filePath,
    sizeBytes,
    pageCount: 0,
    sheets: [],
    uploadedAt: now,
    uploadedBy: SYNCED_BY,
    source: source.kind,
    externalRef: offer.externalRef,
    ...(offer.revisionLabel ? { revisionLabel: offer.revisionLabel } : {}),
    ...(offer.title ? { title: offer.title } : {}),
    isCurrent: false,
    indexed: false,
    syncedAt: now,
  });
  return { set, ingested: true };
}

/**
 * Makes the project's synced sets match what the source says now. See the
 * module comment. Throws when the source cannot be reached (nothing changes).
 */
export async function reconcile(deps: DrawingSyncDeps, projectNumber: string): Promise<ReconcileResult> {
  const { repo, source } = deps;
  if (!source) return { status: "no-source" };
  if (!(await repo.projects.get(projectNumber))) return { status: "no-project" };
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const offer = currentOffer(await source.listLatest(projectNumber));
  let current: CaDrawingSet | null = null;
  let ingested = false;
  if (offer) {
    ({ set: current, ingested } = await ingestSet(deps, projectNumber, offer));
  }

  // The current flag, on every synced set from this source.
  const sets = (await repo.drawingSets.list(projectNumber)).filter(
    (s) => isSyncedSet(s) && s.source === source.kind,
  );
  for (const set of sets) {
    const isCurrent = set.id === current?.id;
    const label = isCurrent && offer ? offer.revisionLabel : set.revisionLabel;
    const title = isCurrent && offer ? offer.title : set.title;
    // Already superseded: nothing to change. The current one is always
    // touched, so `syncedAt` says when the source last confirmed it.
    if (!isCurrent && set.isCurrent === false) continue;
    await repo.drawingSets.update(projectNumber, set.id, (s) => ({
      ...s,
      isCurrent,
      // A label corrected in the CA app reaches the current set.
      ...(label ? { revisionLabel: label } : {}),
      ...(title ? { title } : {}),
      ...(isCurrent ? { syncedAt: now } : {}),
    }));
  }

  // Sheets follow their set: superseded sets' sheets stop being current, so
  // the picker offers the latest. Their pins, and reports using them, stay.
  const syncedIds = new Map(sets.map((s) => [s.id, s.id === current?.id]));
  for (const drawing of await repo.drawings.list(projectNumber)) {
    if (!drawing.drawingSetId || !syncedIds.has(drawing.drawingSetId)) continue;
    const isCurrent = syncedIds.get(drawing.drawingSetId)!;
    if (drawing.isCurrent !== isCurrent) await repo.drawings.upsert({ ...drawing, isCurrent });
  }

  return current ? { status: "current", setId: current.id, ingested } : { status: "none" };
}

// ---------------------------------------------------------------------------
// Scheduling: one run per project at a time, throttled unless forced
// (`src/lib/ca/reconcileScheduler.ts`, shared with the specification sync).
// ---------------------------------------------------------------------------

const scheduler = createReconcileScheduler<DrawingSyncDeps, ReconcileResult>(
  "__caDrawingSync",
  "Drawing sync",
  reconcile,
);

/** True while a reconcile of the project is running on this instance. */
export function isSyncing(projectNumber: string): boolean {
  return scheduler.isSyncing(projectNumber);
}

/**
 * Runs `reconcile` for the project unless one ran recently (`force` skips
 * that check: a push from ccr, or "Check for updates"). Never throws: a
 * failure is logged and reported as null, and the next request retries.
 */
export function scheduleReconcile(
  deps: () => DrawingSyncDeps,
  projectNumber: string,
  options: { force?: boolean; nowMs?: number } = {},
): Promise<ReconcileResult | null> {
  return scheduler.schedule(deps, projectNumber, options);
}

/** For tests: forget every throttle and run. */
export function resetDrawingSyncState() {
  scheduler.reset();
}
