"use client";

import type { PhotoMeta } from "@/services/ca/photoService";
import type { PinBody } from "@/services/ca/pinService";
import type { ReportPutBody } from "@/services/ca/reportService";

import { openCaDb, type OutboxEntry } from "./db";
import { emitCaLocalChange } from "./events";

/**
 * Pushes queued on-device records to the server.
 *
 * Rules:
 * - Sequential, one record at a time: field connections are narrow.
 * - Every write is an idempotent PUT keyed by the record's device-generated
 *   id, so a retry after a dropped response can never create a duplicate.
 * - Network failures and 5xx/429 back off exponentially (5s → 5min) and retry.
 * - 401 (session expired) stops the run and reports "sign in"; data stays put.
 * - Other 4xx are "blocked": retrying will not help, so the record is marked
 *   for the engineer to see, and stays on the device.
 * - If the record changes while its upload is in flight, it stays queued and
 *   the newer version goes out next - an edit is never lost to a race.
 *
 * The transport is injected so the engine can be tested without a browser.
 */

export type SyncTransport = {
  putPhoto(projectNumber: string, photoId: string, meta: PhotoMeta, file?: Blob): Promise<unknown>;
  putPin(projectNumber: string, pinId: string, body: PinBody): Promise<unknown>;
  putReport(projectNumber: string, reportId: string, body: ReportPutBody): Promise<unknown>;
};

/** Thrown by transports for HTTP failures; anything else counts as network. */
export type HttpError = Error & { status: number };

const isHttpError = (error: unknown): error is HttpError =>
  error instanceof Error && typeof (error as { status?: unknown }).status === "number";

export type SyncPhase = "idle" | "syncing" | "offline" | "auth" | "error";

export type SyncSnapshot = {
  phase: SyncPhase;
  /** Records waiting to sync (including ones backing off). */
  pending: number;
  /** Records that need attention (blocked). */
  blocked: number;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const KIND_ORDER: Record<OutboxEntry["kind"], number> = { pin: 0, photo: 1, draft: 2 };

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export function createSyncEngine(deps: {
  transport: SyncTransport;
  now?: () => number;
  isOnline?: () => boolean;
}) {
  const now = deps.now ?? (() => Date.now());
  const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));

  let snapshot: SyncSnapshot = {
    phase: "idle",
    pending: 0,
    blocked: 0,
    lastSyncedAt: null,
    lastError: null,
  };
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;

  function set(patch: Partial<SyncSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  async function counts() {
    const entries = await (await openCaDb()).getAll("outbox");
    return {
      pending: entries.filter((e) => !e.blocked).length,
      blocked: entries.filter((e) => e.blocked).length,
    };
  }

  async function refreshCounts() {
    const c = await counts();
    // Never leave a stale "syncing" label behind.
    set({ ...c, phase: snapshot.phase === "syncing" ? "syncing" : snapshot.phase });
  }

  async function processPhoto(entry: OutboxEntry): Promise<void> {
    const db = await openCaDb();
    const photo = await db.get("photos", entry.entityId);
    if (!photo) {
      // Removed locally (pruned); nothing left to send.
      await db.delete("outbox", entry.key);
      return;
    }
    const meta: PhotoMeta = {
      caption: photo.caption,
      fileName: photo.fileName,
      takenAt: photo.takenAt,
      clientUpdatedAt: photo.clientUpdatedAt,
      ...(photo.pinId ? { pinId: photo.pinId } : {}),
      ...(photo.reportId ? { reportId: photo.reportId } : {}),
      ...(photo.width ? { width: photo.width } : {}),
      ...(photo.height ? { height: photo.height } : {}),
      ...(photo.deleted ? { deleted: true } : {}),
    };

    try {
      await deps.transport.putPhoto(
        photo.projectNumber,
        photo.id,
        meta,
        photo.uploaded || photo.deleted || !photo.blob ? undefined : photo.blob,
      );
    } catch (error) {
      // The server says it has never received the bytes: send them next time.
      if (isHttpError(error) && error.status === 409 && photo.uploaded && photo.blob) {
        await db.put("photos", { ...photo, uploaded: false });
      }
      throw error;
    }

    // Re-read: if the engineer edited the photo while this was in flight, keep
    // it queued so the newer version is sent next.
    const latest = await db.get("photos", photo.id);
    const changed = latest && latest.clientUpdatedAt !== photo.clientUpdatedAt;
    // A deletion that reached the server: nothing left to keep on the device.
    if (latest?.deleted && !changed) {
      await db.delete("photos", photo.id);
      await db.delete("outbox", entry.key);
      return;
    }
    if (latest) {
      await db.put("photos", {
        ...latest,
        uploaded: true,
        syncState: changed ? "pending" : "synced",
        lastError: undefined,
      });
    }
    if (!changed) await db.delete("outbox", entry.key);
  }

  async function processPin(entry: OutboxEntry): Promise<void> {
    const db = await openCaDb();
    const pin = await db.get("pins", entry.entityId);
    if (!pin) {
      await db.delete("outbox", entry.key);
      return;
    }
    await deps.transport.putPin(pin.projectNumber, pin.id, {
      drawingId: pin.drawingId,
      x: pin.x,
      y: pin.y,
      label: pin.label,
      note: pin.note,
      createdAt: pin.createdAt,
      clientUpdatedAt: pin.clientUpdatedAt,
      ...(pin.deleted ? { deleted: true } : {}),
    });
    // Same in-flight edit rule as photos: a newer version stays queued.
    const latest = await db.get("pins", pin.id);
    const changed = latest && latest.clientUpdatedAt !== pin.clientUpdatedAt;
    if (latest) {
      await db.put("pins", { ...latest, syncState: changed ? "pending" : "synced", lastError: undefined });
    }
    if (!changed) await db.delete("outbox", entry.key);
  }

  async function processDraft(entry: OutboxEntry): Promise<void> {
    const db = await openCaDb();
    const draft = await db.get("drafts", entry.entityId);
    if (!draft) {
      await db.delete("outbox", entry.key);
      return;
    }
    await deps.transport.putReport(draft.projectNumber, draft.id, {
      draft: draft.content,
      clientUpdatedAt: draft.clientUpdatedAt,
      createdAt: draft.createdAt,
      ...(draft.discipline ? { discipline: draft.discipline } : {}),
    });
    const latest = await db.get("drafts", draft.id);
    const changed = latest && latest.clientUpdatedAt !== draft.clientUpdatedAt;
    if (latest) {
      await db.put("drafts", { ...latest, syncState: changed ? "pending" : "synced", lastError: undefined });
    }
    if (!changed) await db.delete("outbox", entry.key);
  }

  async function handleFailure(entry: OutboxEntry, error: unknown): Promise<"stop" | "continue"> {
    const db = await openCaDb();
    const message = error instanceof Error ? error.message : "Sync failed.";

    if (isHttpError(error) && error.status === 401) {
      set({ phase: "auth", lastError: "Your session has expired. Sign in again to sync." });
      return "stop";
    }

    const retryable =
      !isHttpError(error) || error.status >= 500 || error.status === 429 || error.status === 408 ||
      (error.status === 409 && entry.kind === "photo");

    if (retryable) {
      const attempts = entry.attempts + 1;
      await db.put("outbox", {
        ...entry,
        attempts,
        nextAttemptAt: now() + backoffMs(attempts),
        lastError: message,
      });
      if (!isHttpError(error)) {
        set({ phase: isOnline() ? "error" : "offline", lastError: message });
        return "stop"; // No point trying the rest without a connection.
      }
      set({ lastError: message });
      return "continue";
    }

    await db.put("outbox", { ...entry, blocked: true, lastError: message });
    if (entry.kind === "photo") {
      const photo = await db.get("photos", entry.entityId);
      if (photo) await db.put("photos", { ...photo, syncState: "error", lastError: message });
    } else if (entry.kind === "pin") {
      const pin = await db.get("pins", entry.entityId);
      if (pin) await db.put("pins", { ...pin, syncState: "error", lastError: message });
    } else {
      const draft = await db.get("drafts", entry.entityId);
      if (draft) await db.put("drafts", { ...draft, syncState: "error", lastError: message });
    }
    set({ lastError: message });
    return "continue";
  }

  async function run(): Promise<void> {
    if (!isOnline()) {
      await refreshCounts();
      set({ phase: "offline" });
      return;
    }
    set({ phase: "syncing", lastError: null });
    const db = await openCaDb();
    let stopped = false;
    let failures = 0;

    // Loop until nothing due remains; entries queued mid-run are picked up.
    for (let guard = 0; guard < 1000 && !stopped; guard++) {
      const due = (await db.getAll("outbox"))
        .filter((e) => !e.blocked && e.nextAttemptAt <= now())
        // Pins first, so a photo never arrives before the pin it is filed under.
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key));
      if (due.length === 0) break;

      for (const entry of due) {
        try {
          if (entry.kind === "photo") await processPhoto(entry);
          else if (entry.kind === "pin") await processPin(entry);
          else await processDraft(entry);
        } catch (error) {
          failures += 1;
          if ((await handleFailure(entry, error)) === "stop") {
            stopped = true;
            break;
          }
        }
        emitCaLocalChange(entry.projectNumber, "sync");
        await refreshCounts();
      }
      if (failures > 0) break; // Failed entries are now backing off.
    }

    const c = await counts();
    if (snapshot.phase === "syncing") {
      set({
        ...c,
        phase: c.blocked > 0 || (failures > 0 && c.pending > 0) ? "error" : "idle",
        lastSyncedAt: failures === 0 ? new Date(now()).toISOString() : snapshot.lastSyncedAt,
      });
    } else {
      set(c);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Runs a sync pass; concurrent calls share the pass in progress. */
    syncNow(): Promise<void> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
    refreshCounts,
    /** Earliest time a backing-off entry becomes due, or null. */
    async nextDueAt(): Promise<number | null> {
      const entries = (await (await openCaDb()).getAll("outbox")).filter((e) => !e.blocked);
      return entries.length ? Math.min(...entries.map((e) => e.nextAttemptAt)) : null;
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
