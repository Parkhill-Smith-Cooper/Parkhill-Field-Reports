"use client";

import { newCaPhotoId } from "@/lib/ca/ids";
import { downscaleImage, type DownscaledImage } from "@/lib/downscaleImage";

import {
  openCaDb,
  outboxKey,
  requestPersistentStorage,
  type LocalPhoto,
  type OutboxKind,
} from "./db";
import { emitCaLocalChange } from "./events";

/**
 * On-device photo capture. A photo is saved to IndexedDB and queued for sync
 * in one step, before any network call, so it survives a dead signal, a
 * closed app or a restarted phone. The sync engine uploads it later.
 *
 * Every photo is downscaled first (`downscaleImage`, shared with CX): 200-400
 * KB instead of 3-5 MB, which matters both for phone storage and field LTE.
 */

type Downscale = (file: File) => Promise<DownscaledImage>;

/** An edit time strictly after `previous`, so two edits can never share a timestamp. */
function nextStamp(previous: string | undefined): string {
  const now = Date.now();
  const prev = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(now, Number.isNaN(prev) ? 0 : prev + 1)).toISOString();
}

/** Synced photos older than this are dropped from the device (the server keeps them). */
const KEEP_SYNCED_DAYS = 30;

export async function enqueue(kind: OutboxKind, entityId: string, projectNumber: string) {
  const db = await openCaDb();
  // Same key for the same record: re-queuing replaces, never duplicates, and
  // resets any backoff so the newest edit goes out promptly.
  await db.put("outbox", {
    key: outboxKey(kind, entityId),
    kind,
    entityId,
    projectNumber,
    attempts: 0,
    nextAttemptAt: 0,
    blocked: false,
  });
}

export async function captureFiles(
  projectNumber: string,
  files: File[],
  options: { pinId?: string; downscale?: Downscale } = {},
): Promise<{ saved: string[]; failed: { name: string; error: string }[] }> {
  const downscale = options.downscale ?? downscaleImage;
  const db = await openCaDb();
  const saved: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const file of files) {
    try {
      const image = await downscale(file);
      const now = new Date().toISOString();
      const photo: LocalPhoto = {
        id: newCaPhotoId(),
        projectNumber,
        blob: image.blob,
        fileName: file.name || "photo.jpg",
        caption: "",
        // Library photos carry their own date; camera captures are "now".
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : now,
        ...(options.pinId ? { pinId: options.pinId } : {}),
        width: image.width,
        height: image.height,
        createdAt: now,
        clientUpdatedAt: now,
        uploaded: false,
        syncState: "pending",
      };
      const tx = db.transaction(["photos", "outbox"], "readwrite");
      await tx.objectStore("photos").put(photo);
      await tx.objectStore("outbox").put({
        key: outboxKey("photo", photo.id),
        kind: "photo",
        entityId: photo.id,
        projectNumber,
        attempts: 0,
        nextAttemptAt: 0,
        blocked: false,
      });
      await tx.done;
      saved.push(photo.id);
    } catch (error) {
      failed.push({
        name: file.name || "photo",
        error: error instanceof Error ? error.message : "Could not save the photo.",
      });
    }
  }

  if (saved.length > 0) {
    void requestPersistentStorage();
    emitCaLocalChange(projectNumber);
  }
  return { saved, failed };
}

export async function listLocalPhotos(projectNumber: string): Promise<LocalPhoto[]> {
  const db = await openCaDb();
  const photos = await db.getAllFromIndex("photos", "byProject", projectNumber);
  return photos.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export async function getLocalPhoto(id: string): Promise<LocalPhoto | undefined> {
  return (await openCaDb()).get("photos", id);
}

/**
 * Edits a photo's caption or pin on the device and queues the change. Works
 * for photos captured elsewhere too (seeded from the server copy), so a
 * caption can be edited offline for any photo the device has seen.
 */
export async function updateLocalPhoto(
  id: string,
  patch: Partial<Pick<LocalPhoto, "caption" | "pinId">>,
  seed?: Omit<LocalPhoto, "caption" | "clientUpdatedAt" | "syncState">,
): Promise<void> {
  const db = await openCaDb();
  const existing = (await db.get("photos", id)) ?? (seed ? { ...seed, caption: "", clientUpdatedAt: "", syncState: "synced" as const } : undefined);
  if (!existing) throw new Error("That photo is not available on this device.");
  const updated: LocalPhoto = {
    ...existing,
    ...patch,
    clientUpdatedAt: nextStamp(existing.clientUpdatedAt),
    syncState: "pending",
    lastError: undefined,
  };
  await db.put("photos", updated);
  await enqueue("photo", id, updated.projectNumber);
  emitCaLocalChange(updated.projectNumber);
}

/** Lets a blocked photo try again (after the engineer taps "Retry"). */
export async function retryBlocked(): Promise<void> {
  const db = await openCaDb();
  const entries = await db.getAll("outbox");
  for (const entry of entries.filter((e) => e.blocked)) {
    await db.put("outbox", { ...entry, blocked: false, attempts: 0, nextAttemptAt: 0, lastError: undefined });
  }
  emitCaLocalChange(null);
}

/**
 * Housekeeping: removes photos that synced more than KEEP_SYNCED_DAYS ago, so
 * months of field work do not fill the phone. Never touches anything unsynced.
 */
export async function pruneSyncedPhotos(now = Date.now()): Promise<number> {
  const db = await openCaDb();
  const cutoff = now - KEEP_SYNCED_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const photo of await db.getAll("photos")) {
    const pending = await db.get("outbox", outboxKey("photo", photo.id));
    if (!pending && photo.syncState === "synced" && Date.parse(photo.createdAt) < cutoff) {
      await db.delete("photos", photo.id);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Deletes a photo from the project, on this device first.
 *
 * The photo becomes a tombstone queued for sync (even if it seems never to
 * have uploaded - its upload reply may have been lost), so the deletion
 * reaches the server and every device. Its image bytes are dropped from this
 * device straight away; after the deletion syncs, the record goes too.
 *
 * The server keeps the file, so reports already issued keep their copy.
 */
export async function deleteLocalPhoto(
  id: string,
  seed?: Omit<LocalPhoto, "caption" | "clientUpdatedAt" | "syncState">,
): Promise<void> {
  const db = await openCaDb();
  const existing = await db.get("photos", id);
  const base = existing ?? (seed ? { ...seed, caption: "", clientUpdatedAt: "", syncState: "synced" as const } : undefined);
  if (!base) throw new Error("That photo is not available on this device.");
  await db.put("photos", {
    ...base,
    blob: null,
    deleted: true,
    clientUpdatedAt: nextStamp(base.clientUpdatedAt),
    syncState: "pending",
    lastError: undefined,
  });
  await enqueue("photo", id, base.projectNumber);
  emitCaLocalChange(base.projectNumber);
}
