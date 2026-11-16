"use client";

/**
 * A tiny change bus for on-device CA data. Writers call `emitCaLocalChange`;
 * views (photo grid, sync pill) subscribe and re-read, so nothing polls
 * IndexedDB. `origin` lets the auto-sync react to the engineer's edits
 * without re-triggering on the sync engine's own bookkeeping writes.
 */
export type ChangeOrigin = "user" | "sync";
type Listener = (projectNumber: string | null, origin: ChangeOrigin) => void;

const listeners = new Set<Listener>();

export function emitCaLocalChange(projectNumber: string | null = null, origin: ChangeOrigin = "user") {
  for (const listener of listeners) listener(projectNumber, origin);
}

export function onCaLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
