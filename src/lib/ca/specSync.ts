import "server-only";

import { blocksOf } from "@/lib/ca/blocks";
import type { CaFileStore, CaRepository, CaSourceSpecSection, CaSpecSource } from "@/lib/ca/contracts";
import { caSpecSectionPath } from "@/lib/ca/paths";
import { createReconcileScheduler } from "@/lib/ca/reconcileScheduler";
import { MAX_SET_BLOCKS, SET_BLOCK_BYTES } from "@/lib/ca/sheetIndex";
import { syncedSpecSectionId } from "@/lib/ca/syncedSets";
import type { CaSpecSection } from "@/types/ca";

/**
 * Keeps each project's specification sections in step with the CA
 * application's Document Control (Specifications), on the server, in our own
 * file store. The drawing-set sync's sibling (`drawingSync.ts`), simpler:
 * many current files per project, no sheets, no pins, no indexing.
 *
 * `reconcileSpecs` is the whole algorithm. It asks the source which revision
 * of each section is current, copies any it does not have yet, and marks
 * exactly those current. Every other revision — superseded, or of a section
 * the CA application no longer lists — is marked not current. Nothing is
 * deleted.
 *
 * It runs when ccr pushes a change (`POST /api/ca/integrations/ccr/specifications`),
 * when a project's specifications are listed (at most every few minutes),
 * and on "Check for updates". ccr says what is current; nothing here infers
 * it from revision numbers or dates.
 */

export type SpecSyncDeps = {
  repo: CaRepository;
  files: CaFileStore;
  source: CaSpecSource | null;
  now?: () => Date;
};

export type SpecReconcileResult =
  | { status: "no-source" | "no-project" }
  | { status: "synced"; current: number; ingested: number; failed: number };

/** Sections copied at once. A first sync can be hundreds of files. */
export const INGEST_CONCURRENCY = 4;

/** The offers to treat as current: PDFs the source marks latest approved. */
export function currentSpecOffers(offers: CaSourceSpecSection[]): CaSourceSpecSection[] {
  return offers.filter((o) => o.fileType === "pdf" && o.isLatestApproved);
}

/**
 * Copies one revision's PDF into the CA file store and records it.
 * Idempotent: the id comes from the revision id, and the file and the record
 * are both create-only, so a repeat (or a race) changes nothing.
 */
export async function ingestSpecSection(
  deps: SpecSyncDeps,
  projectNumber: string,
  offer: CaSourceSpecSection,
): Promise<{ section: CaSpecSection; ingested: boolean }> {
  const { repo, files, source } = deps;
  if (!source) throw new Error("No specification source is configured.");
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const id = syncedSpecSectionId(offer.externalRef);
  const stored = await repo.specSections.get(projectNumber, id);
  if (stored) return { section: stored, ingested: false };

  const filePath = caSpecSectionPath(projectNumber, id);
  let blockCount = 0;
  // Present when an earlier attempt stored the PDF but stopped before recording it.
  if (!(await files.exists(filePath))) {
    const file = await source.fetchFile(projectNumber, offer.externalRef);
    for await (const block of blocksOf(file.bytes)) {
      if (blockCount === 0 && new TextDecoder().decode(block.subarray(0, 5)) !== "%PDF-") {
        throw new Error(`The CA application's file for ${offer.externalRef} is not a PDF.`);
      }
      if (blockCount >= MAX_SET_BLOCKS) {
        throw new Error(`The section ${offer.sectionNumber} is larger than ${(MAX_SET_BLOCKS * SET_BLOCK_BYTES) >> 20} MB.`);
      }
      await files.stageBlock(filePath, blockCount, block);
      blockCount += 1;
    }
    if (blockCount === 0) throw new Error(`The CA application's file for ${offer.externalRef} is empty.`);
  }
  const { sizeBytes } = await files.commitBlocks(filePath, Math.max(blockCount, 1), "application/pdf");

  const section = await repo.specSections.create({
    id,
    projectNumber,
    sectionKey: offer.sectionKey,
    sectionNumber: offer.sectionNumber,
    division: offer.division,
    title: offer.title,
    revision: offer.revision,
    ...(offer.revisionLabel ? { revisionLabel: offer.revisionLabel } : {}),
    fileName: offer.fileName,
    filePath,
    sizeBytes,
    source: source.kind,
    externalRef: offer.externalRef,
    isCurrent: false,
    ...(offer.uploadedAt ? { uploadedAt: offer.uploadedAt } : {}),
    syncedAt: now,
  });
  return { section, ingested: true };
}

/** Runs `task` over `items`, at most `limit` at a time. */
async function eachLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Makes the project's synced sections match what the source says now. See
 * the module comment. Throws when the source cannot be listed (nothing
 * changes); one section failing to copy is logged and does not stop the rest,
 * and the next run tries it again.
 */
export async function reconcileSpecs(deps: SpecSyncDeps, projectNumber: string): Promise<SpecReconcileResult> {
  const { repo, source } = deps;
  if (!source) return { status: "no-source" };
  if (!(await repo.projects.get(projectNumber))) return { status: "no-project" };
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const offers = currentSpecOffers(await source.listCurrent(projectNumber));
  const currentIds = new Set<string>();
  const offerById = new Map<string, CaSourceSpecSection>();
  let ingested = 0;
  let failed = 0;

  await eachLimited(offers, INGEST_CONCURRENCY, async (offer) => {
    try {
      const result = await ingestSpecSection(deps, projectNumber, offer);
      currentIds.add(result.section.id);
      offerById.set(result.section.id, offer);
      if (result.ingested) ingested += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[CA] Specification ${offer.sectionNumber} (${offer.externalRef}) for ${projectNumber} failed to sync:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  // A section whose current revision failed to copy keeps its previous one
  // current rather than showing nothing; it is replaced on the next run.
  const failedKeys = new Set(
    offers.filter((o) => !currentIds.has(syncedSpecSectionId(o.externalRef))).map((o) => o.sectionKey),
  );

  const stored = (await repo.specSections.list(projectNumber)).filter((s) => s.source === source.kind);
  for (const section of stored) {
    const keepPrevious = failedKeys.has(section.sectionKey) && section.isCurrent;
    const isCurrent = currentIds.has(section.id) || keepPrevious;
    const offer = offerById.get(section.id);
    // Already superseded: nothing to change. The current ones are always
    // touched, so `syncedAt` says when the source last confirmed them.
    if (!isCurrent && !section.isCurrent) continue;
    if (keepPrevious) continue;
    await repo.specSections.update(projectNumber, section.id, (s) => ({
      ...s,
      isCurrent,
      // A title or label corrected in the CA app reaches the current revision.
      ...(offer ? { title: offer.title } : {}),
      ...(offer?.revisionLabel ? { revisionLabel: offer.revisionLabel } : {}),
      ...(isCurrent ? { syncedAt: now } : {}),
    }));
  }

  return { status: "synced", current: currentIds.size, ingested, failed };
}

const scheduler = createReconcileScheduler<SpecSyncDeps, SpecReconcileResult>(
  "__caSpecSync",
  "Specification sync",
  reconcileSpecs,
);

/** True while a specification reconcile of the project is running on this instance. */
export function isSyncingSpecs(projectNumber: string): boolean {
  return scheduler.isSyncing(projectNumber);
}

/** Throttled, never-throwing reconcile; `force` for a push from ccr or "Check for updates". */
export function scheduleSpecReconcile(
  deps: () => SpecSyncDeps,
  projectNumber: string,
  options: { force?: boolean; nowMs?: number } = {},
): Promise<SpecReconcileResult | null> {
  return scheduler.schedule(deps, projectNumber, options);
}

/** For tests: forget every throttle and run. */
export function resetSpecSyncState() {
  scheduler.reset();
}
