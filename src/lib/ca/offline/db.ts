"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { CaDrawing, CaPin, CaProject } from "@/types/ca";

/**
 * The on-device store for CA Field Reports (IndexedDB).
 *
 * Everything an engineer captures is written here FIRST and synced to the
 * server afterwards. IndexedDB survives closing the tab, closing the browser
 * and restarting the phone, which `sessionStorage` (used by the CX wizard)
 * does not.
 *
 * Stores:
 * - `projects`  cached project records, so a project opens with no signal.
 * - `photos`    captured photos, including the downscaled JPEG bytes.
 * - `pins`      floor-plan pins, queued for sync like photos.
 * - `drawings`  drawing records and sheet images, cached for offline viewing.
 * - `drafts`    report drafts (Phase 4).
 * - `outbox`    one entry per record waiting to sync. Keyed by
 *               `{kind}:{entityId}`, so re-queuing the same record replaces
 *               its entry instead of adding a second one - a record can be
 *               waiting at most once.
 */

export type SyncState = "pending" | "synced" | "error";

export type LocalPhoto = {
  id: string;
  projectNumber: string;
  /** The downscaled JPEG. Kept after sync so the photo stays viewable offline. */
  blob: Blob | null;
  fileName: string;
  caption: string;
  takenAt: string;
  pinId?: string;
  width?: number;
  height?: number;
  createdAt: string;
  clientUpdatedAt: string;
  /** The server has acknowledged the image bytes at least once. */
  uploaded: boolean;
  syncState: SyncState;
  lastError?: string;
};

/** A floor-plan pin as kept on the device (the server adds `createdBy`). */
export type LocalPin = Omit<CaPin, "createdBy"> & {
  syncState: SyncState;
  lastError?: string;
};

/**
 * A drawing record plus its sheet image, so a floor plan opens with no
 * signal. Drawings are added online; this is a read cache, never queued.
 */
export type CachedDrawing = {
  id: string;
  projectNumber: string;
  drawing: CaDrawing;
  /** Null until the sheet image has been downloaded. */
  blob: Blob | null;
  cachedAt: string;
};

export type OutboxKind = "photo" | "pin" | "draft";

export type OutboxEntry = {
  key: string;
  kind: OutboxKind;
  entityId: string;
  projectNumber: string;
  attempts: number;
  /** Epoch ms; not retried before this. */
  nextAttemptAt: number;
  /** Set for failures retrying cannot fix (e.g. a rejected file). */
  blocked: boolean;
  lastError?: string;
};

interface CaDbSchema extends DBSchema {
  projects: { key: string; value: CaProject & { cachedAt: string } };
  photos: { key: string; value: LocalPhoto; indexes: { byProject: string } };
  pins: { key: string; value: LocalPin; indexes: { byProject: string } };
  drawings: { key: string; value: CachedDrawing; indexes: { byProject: string } };
  drafts: { key: string; value: { id: string; projectNumber: string } & Record<string, unknown>; indexes: { byProject: string } };
  outbox: { key: string; value: OutboxEntry };
}

export type CaDb = IDBPDatabase<CaDbSchema>;

const DB_NAME = "parkhill-ca-field-reports";
const DB_VERSION = 1;

let dbPromise: Promise<CaDb> | null = null;

export function openCaDb(): Promise<CaDb> {
  dbPromise ??= openDB<CaDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "projectNumber" });
      for (const name of ["photos", "pins", "drawings", "drafts"] as const) {
        const store = db.createObjectStore(name, { keyPath: "id" });
        store.createIndex("byProject", "projectNumber");
      }
      db.createObjectStore("outbox", { keyPath: "key" });
    },
    blocked() {
      console.warn("[CA offline] Database upgrade blocked by another open tab.");
    },
  });
  return dbPromise;
}

/** Tests only: forget the cached connection so a fresh database is opened. */
export function resetCaDbForTests() {
  dbPromise = null;
}

export function outboxKey(kind: OutboxKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Asks the browser not to evict this site's storage under pressure. Granted
 * automatically for installed (home-screen) apps on most browsers; otherwise
 * best-effort. Safe to call repeatedly.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
