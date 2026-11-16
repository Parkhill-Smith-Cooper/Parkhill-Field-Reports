"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LocalPhoto, SyncState } from "@/lib/ca/offline/db";
import { onCaLocalChange } from "@/lib/ca/offline/events";
import { listLocalPhotos, updateLocalPhoto } from "@/lib/ca/offline/photoStore";
import { fetchCaPhotos, type CaPhotoWithUrl } from "@/services/ca/photoService";

/** One photo as the UI shows it, whether it lives on this device, the server, or both. */
export type CaPhotoView = {
  id: string;
  /** Local blob URL when the device has the bytes (works offline), else the server URL. */
  src: string | null;
  caption: string;
  fileName: string;
  takenAt: string;
  pinId?: string;
  width?: number;
  height?: number;
  syncState: SyncState;
  lastError?: string;
};

/**
 * The project's photos: everything on this device merged with everything on
 * the server, de-duplicated by id (the id is assigned at capture, so the same
 * photo is the same record everywhere). The device copy wins for display and
 * for unsynced edits; the server list fills in photos taken on other devices.
 * Newest first.
 */
export function useCaPhotos(projectNumber: string) {
  const [local, setLocal] = useState<(LocalPhoto & { url: string | null })[]>([]);
  const [server, setServer] = useState<CaPhotoWithUrl[]>([]);
  const [serverReachable, setServerReachable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const urls = useRef(new Map<string, { blob: Blob; url: string }>());

  // Blob URLs are made here (not during render) and reused while the blob is
  // unchanged; URLs for photos no longer on the device are released.
  const readLocal = useCallback(async () => {
    const photos = await listLocalPhotos(projectNumber);
    const cache = urls.current;
    const seen = new Set<string>();
    const withUrls = photos.map((photo) => {
      seen.add(photo.id);
      if (!photo.blob) return { ...photo, url: null };
      const cached = cache.get(photo.id);
      if (cached && cached.blob.size === photo.blob.size) return { ...photo, url: cached.url };
      if (cached) URL.revokeObjectURL(cached.url);
      const url = URL.createObjectURL(photo.blob);
      cache.set(photo.id, { blob: photo.blob, url });
      return { ...photo, url };
    });
    for (const [id, { url }] of cache) {
      if (!seen.has(id)) {
        URL.revokeObjectURL(url);
        cache.delete(id);
      }
    }
    setLocal(withUrls);
    setLoaded(true);
  }, [projectNumber]);

  const readServer = useCallback(
    () =>
      fetchCaPhotos(projectNumber).then(
        (list) => {
          setServer(list);
          setServerReachable(true);
        },
        // Offline or unreachable: keep showing what we have.
        () => setServerReachable(false),
      ),
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

  // Release blob URLs when the component goes away.
  useEffect(() => {
    const cache = urls.current;
    return () => {
      for (const { url } of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  const byId = new Map<string, CaPhotoView>();
  for (const s of server) {
    byId.set(s.id, {
      id: s.id,
      src: s.url,
      caption: s.caption,
      fileName: s.fileName,
      takenAt: s.takenAt,
      pinId: s.pinId,
      width: s.width,
      height: s.height,
      syncState: "synced",
    });
  }
  for (const l of local) {
    const s = byId.get(l.id);
    const serverIsNewer = s && server.find((x) => x.id === l.id)!.clientUpdatedAt > l.clientUpdatedAt && l.syncState === "synced";
    byId.set(l.id, {
      id: l.id,
      src: l.url ?? s?.src ?? null,
      caption: serverIsNewer ? s.caption : l.caption,
      fileName: l.fileName,
      takenAt: l.takenAt,
      pinId: serverIsNewer ? s.pinId : l.pinId,
      width: l.width,
      height: l.height,
      syncState: l.syncState,
      lastError: l.lastError,
    });
  }
  const photos = [...byId.values()].sort((a, b) => b.takenAt.localeCompare(a.takenAt));

  /** Edit a caption (or pin) on the device; it syncs on its own. */
  async function editPhoto(id: string, patch: { caption?: string; pinId?: string }) {
    const s = server.find((x) => x.id === id);
    await updateLocalPhoto(
      id,
      patch,
      s && {
        id: s.id,
        projectNumber,
        blob: null,
        fileName: s.fileName,
        takenAt: s.takenAt,
        pinId: s.pinId,
        width: s.width,
        height: s.height,
        createdAt: s.createdAt,
        uploaded: true,
      },
    );
  }

  return { photos, loaded, serverReachable, editPhoto, refresh: readServer };
}
