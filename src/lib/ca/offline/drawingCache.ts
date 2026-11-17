"use client";

import type { CaDrawing } from "@/types/ca";

import { openCaDb, type CachedDrawing } from "./db";

/**
 * Read cache of the project's drawings for offline use. Drawings are added
 * while online (a sheet is uploaded once, usually from the office); after
 * that the record and its sheet image live on the device so the floor plan
 * opens on site with no signal.
 *
 * In Azure mode sheet URLs are short-lived SAS links that the service worker
 * cannot reuse, which is why the image bytes are kept here rather than relying
 * on the HTTP cache.
 */

export async function listCachedDrawings(projectNumber: string): Promise<CachedDrawing[]> {
  const db = await openCaDb();
  return db.getAllFromIndex("drawings", "byProject", projectNumber);
}

/**
 * Mirrors the server's drawing list into the cache. Records are replaced;
 * a sheet image already cached is kept (sheet files are immutable). Images of
 * current sheets that are missing are fetched with `download`, one at a time.
 * Drawings the server no longer lists are removed.
 */
export async function syncDrawingCache(
  projectNumber: string,
  drawings: (CaDrawing & { url: string })[],
  download: (url: string) => Promise<Blob>,
): Promise<void> {
  const db = await openCaDb();
  const cached = new Map((await listCachedDrawings(projectNumber)).map((c) => [c.id, c]));
  const listed = new Set(drawings.map((d) => d.id));

  for (const old of cached.values()) {
    if (!listed.has(old.id)) await db.delete("drawings", old.id);
  }

  for (const { url, ...drawing } of drawings) {
    const existing = cached.get(drawing.id);
    let blob = existing && existing.drawing.filePath === drawing.filePath ? existing.blob : null;
    if (!blob && drawing.isCurrent) {
      try {
        blob = await download(url);
      } catch (error) {
        console.warn(`[CA offline] Could not cache drawing ${drawing.id}`, error);
      }
    }
    await db.put("drawings", {
      id: drawing.id,
      projectNumber,
      drawing,
      blob,
      cachedAt: new Date().toISOString(),
    });
  }
}

/** Stores a sheet image the device already has (just uploaded), avoiding a re-download. */
export async function cacheDrawing(drawing: CaDrawing, blob: Blob): Promise<void> {
  const db = await openCaDb();
  await db.put("drawings", {
    id: drawing.id,
    projectNumber: drawing.projectNumber,
    drawing,
    blob,
    cachedAt: new Date().toISOString(),
  });
}
