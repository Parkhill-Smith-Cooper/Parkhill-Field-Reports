"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { newCaReportId } from "@/lib/ca/ids";
import type { LocalDraft, SyncState } from "@/lib/ca/offline/db";
import { getLocalDraft, listLocalDrafts, saveLocalDraft } from "@/lib/ca/offline/draftStore";
import { cachedCurrentDrawingSet, mirrorDrawingSets } from "@/lib/ca/offline/drawingSetCache";
import { onCaLocalChange } from "@/lib/ca/offline/events";
import { reportState } from "@/lib/ca/reportContent";
import { currentSyncedSet, reportDrawingSet } from "@/lib/ca/syncedSets";
import { fetchDrawingSets } from "@/services/ca/drawingSetService";
import { fetchCaReport, fetchCaReports } from "@/services/ca/reportService";
import type {
  CaDiscipline,
  CaDrawingSet,
  CaReport,
  CaReportContent,
  CaReportState,
  CaRevisionSummary,
} from "@/types/ca";

export type CaReportListItem = {
  id: string;
  /** Assigned by the server; null until the report first syncs. */
  reportNumber: string | null;
  /** Absent on reports started before disciplines existed. */
  discipline?: CaDiscipline;
  /** Who started the report (display name); absent on older reports. */
  createdByName?: string;
  content: CaReportContent;
  state: CaReportState;
  latestRevision: number | null;
  syncState: SyncState;
  updatedAt: string;
};

/** The device copy wins while it has unsynced edits, or when it is at least as new. */
function preferLocal(local: LocalDraft | undefined, server: CaReport | undefined): boolean {
  if (!local) return false;
  if (!server) return true;
  return local.syncState !== "synced" || local.clientUpdatedAt >= server.draftUpdatedAt;
}

/** How long starting a report waits for the server's word on the current drawing set. */
const CURRENT_SET_WAIT_MS = 3000;

/**
 * The project's current drawing set from the CA application: the server's
 * answer when it comes quickly (it is kept in step with the CA application),
 * else what this device last heard. Null when there is none.
 */
async function currentDrawingSetFor(projectNumber: string): Promise<CaDrawingSet | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const fresh = await Promise.race([
        fetchDrawingSets(projectNumber).then(async ({ sets }) => {
          await mirrorDrawingSets(projectNumber, sets).catch(() => undefined);
          return { sets };
        }),
        new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), CURRENT_SET_WAIT_MS))),
      ]);
      if (fresh) return currentSyncedSet(fresh.sets);
    } catch {
      // Fall back to the device copy.
    } finally {
      clearTimeout(timer);
    }
  }
  return cachedCurrentDrawingSet(projectNumber);
}

/**
 * Starts a report on this device (works offline) and returns its id. The draft
 * is saved and queued at once, so it survives the engineer leaving the page.
 *
 * The report records the project's current drawing set from the CA
 * application, so it is made with the latest drawings and keeps them after a
 * newer set arrives.
 */
export async function startCaReport(
  projectNumber: string,
  content: CaReportContent,
  meta: { discipline?: CaDiscipline; createdByName?: string } = {},
): Promise<string> {
  const id = newCaReportId();
  const set = content.drawingSet ? null : await currentDrawingSetFor(projectNumber);
  const withSet = set ? { ...content, drawingSet: reportDrawingSet(set) } : content;
  await saveLocalDraft({ id, projectNumber, content: withSet, createdAt: new Date().toISOString(), ...meta });
  return id;
}

/** The project's reports: the server's list plus drafts that so far exist only on this device. */
export function useCaReports(projectNumber: string) {
  const [server, setServer] = useState<CaReport[]>([]);
  const [local, setLocal] = useState<LocalDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [serverReachable, setServerReachable] = useState(true);

  const readLocal = useCallback(() => listLocalDrafts(projectNumber).then(setLocal), [projectNumber]);
  const readServer = useCallback(
    () =>
      fetchCaReports(projectNumber).then(
        (list) => {
          setServer(list);
          setServerReachable(true);
          setLoaded(true);
        },
        () => {
          setServerReachable(false);
          setLoaded(true);
        },
      ),
    [projectNumber],
  );

  useEffect(() => {
    void readLocal();
    void readServer();
    return onCaLocalChange((project, origin) => {
      if (project !== null && project !== projectNumber) return;
      void readLocal();
      if (origin === "sync") void readServer();
    });
  }, [projectNumber, readLocal, readServer]);

  const localById = new Map(local.map((d) => [d.id, d]));
  const items: CaReportListItem[] = server.map((r) => {
    const l = localById.get(r.id);
    const takeLocal = preferLocal(l, r);
    return {
      id: r.id,
      reportNumber: r.reportNumber,
      discipline: r.discipline ?? l?.discipline,
      createdByName: r.createdByName ?? l?.createdByName,
      content: takeLocal ? l!.content : r.draft,
      state: takeLocal && l!.syncState !== "synced" && r.latestRevision !== null ? "revising" : reportState(r),
      latestRevision: r.latestRevision,
      syncState: l && l.syncState !== "synced" ? l.syncState : "synced",
      updatedAt: takeLocal ? l!.clientUpdatedAt : r.updatedAt,
    };
  });
  const onServer = new Set(server.map((r) => r.id));
  for (const l of local) {
    if (onServer.has(l.id)) continue;
    // A synced draft missing from a successful server list was deleted elsewhere.
    if (l.syncState === "synced" && serverReachable) continue;
    items.push({
      id: l.id,
      reportNumber: null,
      discipline: l.discipline,
      createdByName: l.createdByName,
      content: l.content,
      state: "draft",
      latestRevision: null,
      syncState: l.syncState,
      updatedAt: l.clientUpdatedAt,
    });
  }
  items.sort(
    (a, b) =>
      (b.reportNumber ?? "999999").localeCompare(a.reportNumber ?? "999999") || b.updatedAt.localeCompare(a.updatedAt),
  );

  return { reports: items, loaded, serverReachable, refresh: readServer };
}

/**
 * One report for the editor: the draft shown (device copy or server copy,
 * whichever is current), its version stamp for Issue, and its revisions.
 */
export function useCaReport(projectNumber: string, reportId: string) {
  const [local, setLocal] = useState<LocalDraft | undefined>();
  const [localRead, setLocalRead] = useState(false);
  const [server, setServer] = useState<{ report: CaReport; revisions: CaRevisionSummary[] } | null>(null);
  const [serverState, setServerState] = useState<"loading" | "ok" | "missing" | "offline">("loading");
  // Set from callbacks (never during render); used when saving the first local copy.
  const serverCreatedAt = useRef<string | null>(null);
  // Set alongside it: a first local copy of a report started elsewhere keeps its discipline and author.
  const serverMeta = useRef<Pick<CaReport, "discipline" | "createdByName">>({});

  const readLocal = useCallback(
    () =>
      getLocalDraft(reportId).then((d) => {
        setLocal(d);
        setLocalRead(true);
      }),
    [reportId],
  );
  const readServer = useCallback(
    () =>
      fetchCaReport(projectNumber, reportId).then(
        (result) => {
          serverCreatedAt.current = result.report.createdAt;
          serverMeta.current = { discipline: result.report.discipline, createdByName: result.report.createdByName };
          setServer(result);
          setServerState("ok");
        },
        (error: { status?: number }) => setServerState(error?.status === 404 ? "missing" : "offline"),
      ),
    [projectNumber, reportId],
  );

  useEffect(() => {
    void readLocal();
    void readServer();
    return onCaLocalChange((project, origin) => {
      if (project !== null && project !== projectNumber) return;
      void readLocal();
      if (origin === "sync") void readServer();
    });
  }, [projectNumber, readLocal, readServer]);

  const takeLocal = preferLocal(local, server?.report);
  const content = takeLocal ? local!.content : (server?.report.draft ?? null);
  /** The version stamp of the draft shown; Issue sends it so only this version can be issued. */
  const version = takeLocal ? local!.clientUpdatedAt : (server?.report.draftUpdatedAt ?? null);
  const loaded = localRead && (serverState !== "loading" || Boolean(local));

  /** Saves an edit on the device and queues it for sync. */
  const save = useCallback(
    async (next: CaReportContent) => {
      const existing = await getLocalDraft(reportId);
      const saved = await saveLocalDraft({
        id: reportId,
        projectNumber,
        content: next,
        createdAt: existing?.createdAt ?? serverCreatedAt.current ?? new Date().toISOString(),
        // Stored values win (saveLocalDraft keeps them); these fill a first copy.
        discipline: serverMeta.current.discipline,
        createdByName: serverMeta.current.createdByName,
      });
      setLocal(saved);
    },
    [projectNumber, reportId],
  );

  return {
    loaded,
    /** "missing": not on the server and not on this device. */
    notFound: localRead && !local && serverState === "missing",
    content,
    version,
    discipline: server?.report.discipline ?? local?.discipline,
    createdByName: server?.report.createdByName ?? local?.createdByName,
    report: server?.report ?? null,
    revisions: server?.revisions ?? [],
    syncState: local?.syncState ?? (server ? "synced" : "pending"),
    serverReachable: serverState !== "offline",
    /** "ok": `report` is the server's; "missing": never reached the server; else not known yet. */
    serverState,
    save,
    refresh: readServer,
  };
}
