"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { openPdf, type OpenedPdf, type PreparedSheet } from "@/lib/ca/drawingSheet";
import { newCaSheetSetId } from "@/lib/ca/ids";
import { listCachedDrawingSets, mirrorDrawingSets } from "@/lib/ca/offline/drawingSetCache";
import { isSyncedSet } from "@/lib/ca/syncedSets";
import {
  initialSheets,
  MAX_PAGES_PER_REQUEST,
  titleBlockLines,
  type SheetNameRequestPage,
} from "@/lib/ca/sheetIndex";
import { ApiRequestError } from "@/services/apiClient";
import {
  checkDrawingSetUpdates,
  editSetSheet,
  fetchDrawingSets,
  indexDrawingSet,
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
/** While the server is copying a set from the CA application, ask again this often. */
const SYNC_POLL_MS = 4000;

export type IndexingStatus = { done: number; total: number } | { failed: string };

/**
 * Sets being indexed on this device, shared by every hook instance (Capture
 * and the Add drawing dialog may both be mounted), so a set is read once.
 */
const indexingNow = new Map<string, Promise<void>>();

/** Every page's title-block text, read on this device. */
async function readTitleBlocks(doc: OpenedPdf, onPage?: (done: number, total: number) => void) {
  const lines = new Map<number, string[]>();
  for (let page = 1; page <= doc.pageCount; page++) {
    const text = await doc.text(page);
    lines.set(page, titleBlockLines(text.items, text.width, text.height));
    onPage?.(page, doc.pageCount);
  }
  return lines;
}

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
  /** The server is copying the CA application's current set. */
  const [syncing, setSyncing] = useState(false);
  const [indexing, setIndexing] = useState<Record<string, IndexingStatus>>({});
  const docs = useRef(new Map<string, Promise<OpenedPdf>>());
  const fetchedAt = useRef(0);
  const latest = useRef<CaDrawingSetWithUrl[]>([]);
  const mounted = useRef(true);

  const store = useCallback((list: CaDrawingSetWithUrl[]) => {
    latest.current = list;
    setSets(list);
  }, []);

  /**
   * A change the server accepted (indexing, naming, an edit, an upload):
   * shown, and kept on the device too, so the sheets are there offline
   * without waiting for the next listing.
   */
  const storeAccepted = useCallback(
    (list: CaDrawingSetWithUrl[]) => {
      store(list);
      void mirrorDrawingSets(projectNumber, list).catch(() => undefined);
    },
    [projectNumber, store],
  );

  const replaceSet = useCallback(
    (next: CaDrawingSetWithUrl) => storeAccepted(latest.current.map((s) => (s.id === next.id ? next : s))),
    [storeAccepted],
  );

  /** Forgets indexing failures, so those sets are tried again. */
  const clearIndexingFailures = useCallback(
    () =>
      setIndexing((prev) =>
        Object.values(prev).some((status) => "failed" in status)
          ? Object.fromEntries(Object.entries(prev).filter(([, status]) => !("failed" in status)))
          : prev,
      ),
    [],
  );

  const refresh = useCallback(
    (): Promise<void> =>
      fetchDrawingSets(projectNumber).then(
        ({ sets: list, syncing: busy }) => {
          fetchedAt.current = Date.now();
          store(list);
          setSyncing(busy);
          setLoadError(null);
          setLoaded(true);
          void mirrorDrawingSets(projectNumber, list).catch(() => undefined);
        },
        (error: unknown) => {
          setLoadError(error instanceof Error ? error.message : "The drawing sets could not be loaded.");
          setSyncing(false);
          setLoaded(true);
        },
      ),
    [projectNumber, store],
  );

  useEffect(() => {
    mounted.current = true;
    // The device copy first (instant, and all there is with no signal), then the server.
    void listCachedDrawingSets(projectNumber)
      .then(
        (cached) => {
          if (fetchedAt.current === 0 && cached.length > 0) store(cached.map((set) => ({ ...set, url: "" })));
        },
        () => undefined,
      )
      .then(refresh);
    return () => {
      mounted.current = false;
    };
  }, [projectNumber, refresh, store]);

  // While the server copies a set, ask again shortly (each answer re-arms this).
  useEffect(() => {
    if (!syncing) return;
    const timer = setTimeout(() => void refresh(), SYNC_POLL_MS);
    return () => clearTimeout(timer);
  }, [syncing, sets, refresh]);

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
          if (!set.url) throw new Error("Opening the drawing set needs a connection.");
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
      const lines = await readTitleBlocks(doc, (done, total) => onProgress?.({ phase: "reading", done, total }));
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
      storeAccepted([...latest.current.filter((s) => s.id !== set.id), set]);
      void nameSheets(set, lines);
      return set;
    } catch (error) {
      await doc.close();
      throw error;
    }
  }

  /**
   * Lists a synced set's pages as sheets. The server copies the PDF from
   * the CA application without reading it, so the first device to open the
   * set reads its title blocks (as for an upload) and saves the sheets for
   * everyone; AI naming follows. Another device getting there first is fine.
   */
  const indexSet = useCallback(
    (set: CaDrawingSetWithUrl): Promise<void> => {
      const running = indexingNow.get(set.id);
      if (running) return running;
      const status = (next: IndexingStatus | null) => {
        if (!mounted.current) return;
        setIndexing((prev) => {
          const copy = { ...prev };
          if (next) copy[set.id] = next;
          else delete copy[set.id];
          return copy;
        });
      };
      const run = (async () => {
        try {
          const doc = await openSet(set.id);
          const lines = await readTitleBlocks(doc, (done, total) => status({ done, total }));
          let indexed: CaDrawingSetWithUrl;
          try {
            indexed = await indexDrawingSet(projectNumber, set.id, {
              pageCount: doc.pageCount,
              sheets: initialSheets([...lines].map(([page, l]) => ({ page, lines: l }))),
            });
          } catch (error) {
            if (error instanceof ApiRequestError && error.status === 409) {
              await refresh();
              status(null);
              return;
            }
            throw error;
          }
          replaceSet(indexed);
          status(null);
          void nameSheets(indexed, lines);
        } catch (error) {
          status({ failed: error instanceof Error ? error.message : "The drawing set could not be read." });
        }
      })().finally(() => indexingNow.delete(set.id));
      indexingNow.set(set.id, run);
      return run;
    },
    [nameSheets, openSet, projectNumber, refresh, replaceSet],
  );

  // A synced set not yet listed as sheets: list it (needs a connection).
  useEffect(() => {
    for (const set of sets) {
      if (isSyncedSet(set) && set.indexed === false && !set.removed && set.url && !indexing[set.id]) {
        void indexSet(set);
      }
    }
  }, [sets, indexing, indexSet]);

  // Back online: sets that failed to index (no connection, say) are tried again.
  useEffect(() => {
    window.addEventListener("online", clearIndexingFailures);
    return () => window.removeEventListener("online", clearIndexingFailures);
  }, [clearIndexingFailures]);

  /** "Check for updates": asks the server to look at the CA application now. */
  async function checkForUpdates() {
    clearIndexingFailures();
    await checkDrawingSetUpdates(projectNumber);
    setSyncing(true);
    await refresh();
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
    storeAccepted(latest.current.filter((s) => s.id !== setId));
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
    syncing,
    indexing,
    refresh,
    checkForUpdates,
    indexSet,
    upload,
    nameSheets: (set: CaDrawingSetWithUrl) => nameSheets(set),
    editSheet,
    removeSet,
    thumbnail,
    renderSheet,
  };
}
