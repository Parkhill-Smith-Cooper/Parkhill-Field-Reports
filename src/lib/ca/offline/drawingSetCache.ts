"use client";

import { currentSyncedSet } from "@/lib/ca/syncedSets";
import type { CaDrawingSet } from "@/types/ca";

import { openCaDb } from "./db";

/**
 * Read cache of the project's drawing sets (records only: sheets, labels,
 * which set is current; never the PDF). Lets a report started with no
 * signal record the current set, and lets Capture list that set's sheets
 * offline. Mirrors the server's list each time it is fetched.
 */

export async function listCachedDrawingSets(projectNumber: string): Promise<CaDrawingSet[]> {
  const db = await openCaDb();
  return (await db.getAllFromIndex("drawingSetIndex", "byProject", projectNumber))
    .map((c) => c.set)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

/** Replaces the project's cached sets with the server's list (URLs dropped). */
export async function mirrorDrawingSets(projectNumber: string, sets: CaDrawingSet[]): Promise<void> {
  const db = await openCaDb();
  const tx = db.transaction("drawingSetIndex", "readwrite");
  const listed = new Set(sets.map((s) => s.id));
  for (const key of await tx.store.index("byProject").getAllKeys(projectNumber)) {
    if (!listed.has(key)) await tx.store.delete(key);
  }
  const cachedAt = new Date().toISOString();
  for (const set of sets) {
    const record = { ...set } as CaDrawingSet & { url?: string };
    delete record.url;
    await tx.store.put({ id: set.id, projectNumber, set: record, cachedAt });
  }
  await tx.done;
}

/** The project's current synced set as this device last heard, or null. */
export async function cachedCurrentDrawingSet(projectNumber: string): Promise<CaDrawingSet | null> {
  try {
    return currentSyncedSet(await listCachedDrawingSets(projectNumber));
  } catch {
    return null;
  }
}
