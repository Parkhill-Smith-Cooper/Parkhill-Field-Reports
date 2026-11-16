"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cacheDrawing, listCachedDrawings, syncDrawingCache } from "@/lib/ca/offline/drawingCache";
import {
  downloadDrawingSheet,
  fetchCaDrawings,
  type CaDrawingWithUrl,
} from "@/services/ca/drawingService";
import type { CaDrawing } from "@/types/ca";

export type CaDrawingView = CaDrawing & {
  /** Device copy when cached (works offline), else the server URL, else null. */
  src: string | null;
  /** The sheet image is stored on this device. */
  offlineReady: boolean;
};

/**
 * The project's drawings. Shows the device cache first (instant, offline),
 * then refreshes from the server and caches any sheet images it lacks.
 * Current sheets first, then by sheet number.
 */
export function useCaDrawings(projectNumber: string) {
  const [views, setViews] = useState<CaDrawingView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [serverReachable, setServerReachable] = useState(true);
  const urls = useRef(new Map<string, { blob: Blob; url: string }>());
  const serverUrls = useRef(new Map<string, string>());

  const readCache = useCallback(async () => {
    const cached = await listCachedDrawings(projectNumber);
    const cache = urls.current;
    const next = cached.map(({ drawing, blob }) => {
      let src: string | null = null;
      if (blob) {
        const hit = cache.get(drawing.id);
        if (hit && hit.blob === blob) src = hit.url;
        else {
          if (hit) URL.revokeObjectURL(hit.url);
          src = URL.createObjectURL(blob);
          cache.set(drawing.id, { blob, url: src });
        }
      }
      return { ...drawing, src: src ?? serverUrls.current.get(drawing.id) ?? null, offlineReady: Boolean(blob) };
    });
    next.sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) ||
        (a.sheetNumber ?? "").localeCompare(b.sheetNumber ?? "", undefined, { numeric: true }) ||
        a.title.localeCompare(b.title),
    );
    setViews(next);
    setLoaded(true);
  }, [projectNumber]);

  const refresh = useCallback(
    () =>
      fetchCaDrawings(projectNumber).then(
        async (list: CaDrawingWithUrl[]) => {
          setServerReachable(true);
          for (const d of list) serverUrls.current.set(d.id, d.url);
          await syncDrawingCache(projectNumber, list, downloadDrawingSheet);
          await readCache();
        },
        async () => {
          setServerReachable(false);
          await readCache();
        },
      ),
    [projectNumber, readCache],
  );

  useEffect(() => {
    void readCache().then(refresh);
  }, [readCache, refresh]);

  useEffect(() => {
    const cache = urls.current;
    return () => {
      for (const { url } of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  /** A drawing just added from this device: cache its sheet without re-downloading. */
  async function added(drawing: CaDrawingWithUrl, sheet: Blob) {
    const { url, ...record } = drawing;
    serverUrls.current.set(record.id, url);
    await cacheDrawing(record, sheet);
    await readCache();
  }

  return { drawings: views, loaded, serverReachable, refresh, added };
}
