"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { openPdf, type OpenedPdf, type PreparedSheet } from "@/lib/ca/drawingSheet";
import { newCaSheetSetId } from "@/lib/ca/ids";
import {
  initialSheets,
  MAX_PAGES_PER_REQUEST,
  titleBlockLines,
  type SheetNameRequestPage,
} from "@/lib/ca/sheetIndex";
import { ApiRequestError } from "@/services/apiClient";
import {
  editSetSheet,
  fetchDrawingSets,
  nameSetSheets,
  removeDrawingSet,
  uploadDrawingSet,
  type CaDrawingSetWithUrl,
  type DrawingSetOrigin,
} from "@/services/ca/drawingSetService";

export type SheetNamingStatus =
  | { state: "running"; done: number; total: number }
  | { state: "unavailable" | "failed"; message: string };

export type UploadProgress =
  | { phase: "reading"; done: number; total: number }
  | { phase: "uploading"; done: number; total: number };

/** A page needs an image for AI when its title block has fewer characters than this. */
const MIN_TITLE_BLOCK_TEXT = 12;
/** AI requests in flight at once for one set. */
const CONCURRENT_REQUESTS = 2;
/** Read URLs last 15 minutes in Azure; open a set's PDF only with a fresher one. */
const URL_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The project's drawing sets, stored on the server (the PDF in the CA file
 * store, the sheets on the set record), so every device sees the same sets
 * and sheet names.
 *
 * Uploading reads every page's title-block text on this device (instant
 * sheet-number guesses), uploads the PDF in blocks, then asks AI for each
 * sheet's number and name in small batches; the server saves the names.
 * Engineer edits always win over AI.
 */
export function useCaDrawingSets(projectNumber: string) {
  const [sets, setSets] = useState<CaDrawingSetWithUrl[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [naming, setNaming] = useState<Record<string, SheetNamingStatus>>({});
  const docs = useRef(new Map<string, Promise<OpenedPdf>>());
  const fetchedAt = useRef(0);
  const latest = useRef<CaDrawingSetWithUrl[]>([]);

  const store = useCallback((list: CaDrawingSetWithUrl[]) => {
    latest.current = list;
    setSets(list);
  }, []);

  const replaceSet = useCallback(
    (next: CaDrawingSetWithUrl) => store(latest.current.map((s) => (s.id === next.id ? next : s))),
    [store],
  );

  const refresh = useCallback(
    () =>
      fetchDrawingSets(projectNumber).then(
        (list) => {
          fetchedAt.current = Date.now();
          store(list);
          setLoadError(null);
          setLoaded(true);
        },
        (error: unknown) => {
          setLoadError(error instanceof Error ? error.message : "The drawing sets could not be loaded.");
          setLoaded(true);
        },
      ),
    [projectNumber, store],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const open = docs.current;
    return () => {
      for (const doc of open.values()) void doc.then((d) => d.close(), () => undefined);
      open.clear();
    };
  }, []);

  /** The set's PDF, opened once per set (from the server, with a fresh URL). */
  const openSet = useCallback(
    (setId: string): Promise<OpenedPdf> => {
      let doc = docs.current.get(setId);
      if (!doc) {
        doc = (async () => {
          if (Date.now() - fetchedAt.current > URL_MAX_AGE_MS) await refresh();
          const set = latest.current.find((s) => s.id === setId);
          if (!set) throw new Error("That drawing set is no longer available.");
          return openPdf(set.url);
        })();
        docs.current.set(setId, doc);
        doc.catch(() => docs.current.delete(setId));
      }
      return doc;
    },
    [refresh],
  );

  /** Asks AI to name every sheet still showing only a guess. */
  const nameSheets = useCallback(
    async (set: CaDrawingSetWithUrl, knownLines?: Map<number, string[]>) => {
      const todo = set.sheets.filter((s) => s.naming === "guess").map((s) => s.page);
      if (todo.length === 0) return;
      const status = (next: SheetNamingStatus | null) =>
        setNaming((prev) => {
          const copy = { ...prev };
          if (next) copy[set.id] = next;
          else delete copy[set.id];
          return copy;
        });

      let done = 0;
      let stopped = false;
      status({ state: "running", done, total: todo.length });

      const chunks: number[][] = [];
      for (let i = 0; i < todo.length; i += MAX_PAGES_PER_REQUEST) chunks.push(todo.slice(i, i + MAX_PAGES_PER_REQUEST));

      try {
        const doc = await openSet(set.id);
        const pageRequest = async (page: number): Promise<SheetNameRequestPage> => {
          let lines = knownLines?.get(page);
          if (!lines) {
            const text = await doc.text(page);
            lines = titleBlockLines(text.items, text.width, text.height);
          }
          const chars = lines.reduce((n, l) => n + l.replace(/^\[\d+\] /, "").length, 0);
          return chars >= MIN_TITLE_BLOCK_TEXT ? { page, lines } : { page, lines, image: await doc.titleBlockImage(page) };
        };

        const worker = async () => {
          while (!stopped && chunks.length > 0) {
            const chunk = chunks.shift()!;
            const pages: SheetNameRequestPage[] = [];
            for (const page of chunk) pages.push(await pageRequest(page));
            replaceSet(await nameSetSheets(set.projectNumber, set.id, pages));
            done += chunk.length;
            if (!stopped) status({ state: "running", done, total: todo.length });
          }
        };
        await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, worker));
        status(null);
      } catch (error) {
        stopped = true;
        if (error instanceof ApiRequestError && error.status === 503) {
          status({ state: "unavailable", message: error.message });
        } else {
          status({
            state: "failed",
            message: error instanceof Error ? error.message : "The sheets could not be named automatically.",
          });
        }
      }
    },
    [openSet, replaceSet],
  );

  /**
   * Reads a drawing-set PDF on this device, uploads it and starts AI naming.
   * Resolves once the set is stored; naming continues in the background.
   * `origin` is given for a set imported from the drawing source.
   */
  async function upload(
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    origin?: DrawingSetOrigin,
  ): Promise<CaDrawingSetWithUrl> {
    const doc = await openPdf(file);
    try {
      const lines = new Map<number, string[]>();
      for (let page = 1; page <= doc.pageCount; page++) {
        const text = await doc.text(page);
        lines.set(page, titleBlockLines(text.items, text.width, text.height));
        onProgress?.({ phase: "reading", done: page, total: doc.pageCount });
      }
      const set = await uploadDrawingSet(
        projectNumber,
        newCaSheetSetId(),
        file,
        {
          pageCount: doc.pageCount,
          sheets: initialSheets([...lines].map(([page, l]) => ({ page, lines: l }))),
          ...(origin ? { origin } : {}),
        },
        (done, total) => onProgress?.({ phase: "uploading", done, total }),
      );
      // This device already has the PDF open: no need to download it back.
      docs.current.set(set.id, Promise.resolve(doc));
      store([...latest.current.filter((s) => s.id !== set.id), set]);
      void nameSheets(set, lines);
      return set;
    } catch (error) {
      await doc.close();
      throw error;
    }
  }

  /** The engineer's correction. Marked edited, so AI never overwrites it. */
  async function editSheet(setId: string, page: number, patch: { sheetNumber: string; sheetName: string }) {
    replaceSet(await editSetSheet(projectNumber, setId, { page, ...patch }));
  }

  async function removeSet(setId: string) {
    await removeDrawingSet(projectNumber, setId);
    const doc = docs.current.get(setId);
    docs.current.delete(setId);
    void doc?.then((d) => d.close(), () => undefined);
    store(latest.current.filter((s) => s.id !== setId));
    setNaming((prev) => {
      const copy = { ...prev };
      delete copy[setId];
      return copy;
    });
  }

  const thumbnail = useCallback(
    async (setId: string, page: number) => (await openSet(setId)).preview(page, 240),
    [openSet],
  );

  const renderSheet = useCallback(
    async (setId: string, page: number): Promise<PreparedSheet> => (await openSet(setId)).renderSheet(page),
    [openSet],
  );

  return {
    sets,
    loaded,
    loadError,
    naming,
    refresh,
    upload,
    nameSheets: (set: CaDrawingSetWithUrl) => nameSheets(set),
    editSheet,
    removeSet,
    thumbnail,
    renderSheet,
  };
}
