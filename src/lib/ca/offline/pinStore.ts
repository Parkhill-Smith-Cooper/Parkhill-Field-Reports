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
 * Edits a pin (label, note, position, or `deleted: true`). `seed` is the
 * server copy, for pins dropped on another device and not yet on this one.
 */
export async function updatePin(
  id: string,
  patch: Partial<PinFields>,
  seed?: Omit<LocalPin, "syncState">,
): Promise<LocalPin> {
  const db = await openCaDb();
  const existing = (await db.get("pins", id)) ?? (seed ? { ...seed, syncState: "synced" as const } : undefined);
  if (!existing) throw new Error("That pin is not available on this device.");
  const updated: LocalPin = {
    ...existing,
    ...patch,
    ...(patch.x !== undefined ? { x: clamp(patch.x) } : {}),
    ...(patch.y !== undefined ? { y: clamp(patch.y) } : {}),
    clientUpdatedAt: new Date().toISOString(),
    syncState: "pending",
    lastError: undefined,
  };
  await writeAndQueue(updated);
  return updated;
}

export async function listLocalPins(projectNumber: string): Promise<LocalPin[]> {
  const db = await openCaDb();
  return db.getAllFromIndex("pins", "byProject", projectNumber);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
