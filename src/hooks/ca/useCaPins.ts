"use client";

import { useCallback, useEffect, useState } from "react";

import type { LocalPin, SyncState } from "@/lib/ca/offline/db";
import { onCaLocalChange } from "@/lib/ca/offline/events";
import { createPin, listLocalPins, updatePin } from "@/lib/ca/offline/pinStore";
import { fetchCaPins } from "@/services/ca/pinService";
import type { CaPin } from "@/types/ca";

export type CaPinView = Omit<CaPin, "createdBy"> & {
  syncState: SyncState;
  lastError?: string;
};

/**
 * The project's pins: this device's copies merged with the server's, by id.
 * A device copy with unsynced changes wins; otherwise the newer edit wins.
 * Deleted pins are kept in `allPins` (so photos filed under them can be
 * treated as unpinned) and left out of `pins`.
 */
export function useCaPins(projectNumber: string) {
  const [local, setLocal] = useState<LocalPin[]>([]);
  const [server, setServer] = useState<CaPin[]>([]);
  const [loaded, setLoaded] = useState(false);

  const readLocal = useCallback(
    () =>
      listLocalPins(projectNumber).then((list) => {
        setLocal(list);
        setLoaded(true);
      }),
    [projectNumber],
  );
  const readServer = useCallback(
    () => fetchCaPins(projectNumber).then(setServer, () => undefined),
    [projectNumber],
  );

  useEffect(() => {
    void readLocal();
    void readServer();
    const off = onCaLocalChange((project, origin) => {
      if (project !== null && project !== projectNumber) return;
      void readLocal();
      if (origin === "sync") void readServer();
    });
    const online = () => void readServer();
    window.addEventListener("online", online);
    return () => {
      off();
      window.removeEventListener("online", online);
    };
  }, [projectNumber, readLocal, readServer]);

  const byId = new Map<string, CaPinView>();
  for (const s of server) {
    const { createdBy: _createdBy, ...rest } = s;
    void _createdBy;
    byId.set(s.id, { ...rest, syncState: "synced" });
  }
  for (const l of local) {
    const s = byId.get(l.id);
    const serverIsNewer = s && l.syncState === "synced" && s.clientUpdatedAt > l.clientUpdatedAt;
    if (!serverIsNewer) byId.set(l.id, l);
  }
  const allPins = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pins = allPins.filter((p) => !p.deleted);

  function seedFor(id: string): Omit<LocalPin, "syncState"> | undefined {
    const s = server.find((p) => p.id === id);
    if (!s) return undefined;
    const { createdBy: _createdBy, ...rest } = s;
    void _createdBy;
    return rest;
  }

  return {
    pins,
    allPins,
    loaded,
    dropPin: (drawingId: string, x: number, y: number) => createPin(projectNumber, { drawingId, x, y }),
    editPin: (id: string, patch: Partial<Pick<LocalPin, "label" | "note" | "x" | "y">>) =>
      updatePin(id, patch, seedFor(id)),
    deletePin: (id: string) => updatePin(id, { deleted: true }, seedFor(id)),
  };
}
