"use client";

import { useSyncExternalStore } from "react";

import { putCaPhoto } from "@/services/ca/photoService";
import { putCaPin } from "@/services/ca/pinService";
import { putCaReport } from "@/services/ca/reportService";

import { onCaLocalChange } from "./events";
import { pruneSyncedPhotos } from "./photoStore";
import { createSyncEngine, type SyncSnapshot } from "./syncEngine";

/**
 * The app's single sync engine, and when it runs.
 *
 * Background Sync is not available on iOS, so sync runs while the app is
 * open, triggered by: app start, regaining connectivity, returning to the
 * app (focus / visibility), any new capture or edit, a 15-second tick while
 * anything is still waiting, and the "Sync now" button.
 */
export const caSync = createSyncEngine({
  transport: {
    putPhoto: (projectNumber, photoId, meta, file) => putCaPhoto(projectNumber, photoId, meta, file),
    putPin: (projectNumber, pinId, body) => putCaPin(projectNumber, pinId, body),
    putReport: (projectNumber, reportId, body) => putCaReport(projectNumber, reportId, body),
  },
});

let started = false;

export function startCaAutoSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const kick = () => void caSync.syncNow();

  window.addEventListener("online", kick);
  window.addEventListener("offline", () => void caSync.syncNow());
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });

  let debounce: ReturnType<typeof setTimeout> | undefined;
  onCaLocalChange((_project, origin) => {
    if (origin !== "user") return;
    void caSync.refreshCounts();
    clearTimeout(debounce);
    debounce = setTimeout(kick, 300);
  });

  setInterval(async () => {
    const due = await caSync.nextDueAt();
    if (due !== null && due <= Date.now()) kick();
  }, 15_000);

  void pruneSyncedPhotos().finally(kick);
}

const SERVER_SNAPSHOT: SyncSnapshot = {
  phase: "idle",
  pending: 0,
  blocked: 0,
  lastSyncedAt: null,
  lastError: null,
};

export function useCaSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(caSync.subscribe, caSync.getSnapshot, () => SERVER_SNAPSHOT);
}
