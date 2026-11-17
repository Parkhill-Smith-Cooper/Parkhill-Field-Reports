"use client";

import { newCaPinId } from "@/lib/ca/ids";

import { openCaDb, outboxKey, requestPersistentStorage, type LocalPin } from "./db";
import { emitCaLocalChange } from "./events";

/**
 * On-device floor-plan pins. Like photos, a pin is written to IndexedDB and
 * queued for sync in one transaction before any network call, so dropping a
 * pin works with no signal. The pin id is generated here and never changes,
 * which makes every sync of it an idempotent PUT.
 */

type PinFields = Pick<LocalPin, "drawingId" | "x" | "y" | "label" | "note" | "deleted">;

async function writeAndQueue(pin: LocalPin): Promise<void> {
  const db = await openCaDb();
  const tx = db.transaction(["pins", "outbox"], "readwrite");
  await tx.objectStore("pins").put(pin);
  await tx.objectStore("outbox").put({
    key: outboxKey("pin", pin.id),
    kind: "pin",
    entityId: pin.id,
    projectNumber: pin.projectNumber,
    attempts: 0,
    nextAttemptAt: 0,
    blocked: false,
  });
  await tx.done;
  emitCaLocalChange(pin.projectNumber);
}

/** Drops a new pin at `x`,`y` (fractions of the sheet) and returns it. */
export async function createPin(
  projectNumber: string,
  fields: Pick<LocalPin, "drawingId" | "x" | "y"> & Partial<Pick<LocalPin, "label" | "note">>,
): Promise<LocalPin> {
  const now = new Date().toISOString();
  const pin: LocalPin = {
    id: newCaPinId(),
    projectNumber,
    drawingId: fields.drawingId,
    x: clamp(fields.x),
    y: clamp(fields.y),
    label: fields.label ?? "",
    note: fields.note ?? "",
    createdAt: now,
    clientUpdatedAt: now,
    syncState: "pending",
  };
  await writeAndQueue(pin);
  void requestPersistentStorage();
  return pin;
}

/**
 * The copy an edit should start from. A device copy with unsynced changes
 * always wins (those changes must not be lost). Otherwise the newer of the
 * device copy and the server copy (`seed`) wins, so editing one field never
 * reverts fields another device changed since this one last synced.
 */
function editBaseline(local: LocalPin | undefined, seed: Omit<LocalPin, "syncState"> | undefined): LocalPin | undefined {
  const fromServer = seed ? { ...seed, syncState: "synced" as const, lastError: undefined } : undefined;
  if (!local) return fromServer;
  if (local.syncState !== "synced" || !fromServer) return local;
  return fromServer.clientUpdatedAt > local.clientUpdatedAt ? fromServer : local;
}

/**
 * Edits a pin (label, note, position, or `deleted: true`). `seed` is the
 * server copy as last fetched: it is the starting point for pins dropped on
 * another device, and for pins changed there since this device synced.
 */
export async function updatePin(
  id: string,
  patch: Partial<PinFields>,
  seed?: Omit<LocalPin, "syncState">,
): Promise<LocalPin> {
  const db = await openCaDb();
  const existing = editBaseline(await db.get("pins", id), seed);
  if (!existing) throw new Error("That pin is not available on this device.");
  const updated: LocalPin = {
    ...existing,
    ...patch,
    ...(patch.x !== undefined ? { x: clamp(patch.x) } : {}),
    ...(patch.y !== undefined ? { y: clamp(patch.y) } : {}),
    // Strictly after the previous edit, so two edits never share a timestamp.
    clientUpdatedAt: new Date(Math.max(Date.now(), Date.parse(existing.clientUpdatedAt || "0") + 1 || 0)).toISOString(),
    syncState: "pending",
    lastError: undefined,
  };
  await writeAndQueue(updated);
  return updated;
}

/**
 * Mirrors pins fetched from the server into the device store so they are
 * still there offline (pins from other devices, newer edits, deletions).
 * These are NOT queued for upload: they already are the server's copy. A
 * device copy with unsynced changes is left alone, as is one that is not
 * older than the server's. Runs in one transaction, so it cannot overwrite an
 * edit written between the check and the write. Returns how many changed.
 */
export async function mirrorServerPins(projectNumber: string, serverPins: Omit<LocalPin, "syncState">[]): Promise<number> {
  const db = await openCaDb();
  const tx = db.transaction("pins", "readwrite");
  const store = tx.objectStore("pins");
  let changed = 0;
  for (const s of serverPins) {
    if (s.projectNumber !== projectNumber) continue;
    const local = await store.get(s.id);
    if (local && (local.syncState !== "synced" || local.clientUpdatedAt >= s.clientUpdatedAt)) continue;
    await store.put({ ...s, syncState: "synced" });
    changed++;
  }
  await tx.done;
  return changed;
}

export async function listLocalPins(projectNumber: string): Promise<LocalPin[]> {
  const db = await openCaDb();
  return db.getAllFromIndex("pins", "byProject", projectNumber);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
