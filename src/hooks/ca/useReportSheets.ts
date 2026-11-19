"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { addSetSheetAsDrawing } from "@/hooks/ca/setSheetDrawing";
import { useCaDrawingSets } from "@/hooks/ca/useCaDrawingSets";
import { useCaDrawings } from "@/hooks/ca/useCaDrawings";
import { useCaReport } from "@/hooks/ca/useCaReports";
import { useOnline } from "@/hooks/ca/useOnline";
import { reportSheetChoices, type CaSheetChoice } from "@/lib/ca/reportSheets";
import { currentSyncedSet, reportDrawingSet } from "@/lib/ca/syncedSets";
import { updateCaDrawing } from "@/services/ca/drawingService";

/**
 * The floor plans of one report (Capture and Site Route): the sheets of the
 * drawing set the report was made with, plus drawings added by hand.
 *
 * - A report that has never been issued and has no set yet gets the
 *   project's current set from the CA application, as soon as one is known
 *   (`startCaReport` usually records it already). Issued reports are left as
 *   they were, so nothing changes in what they show.
 * - A sheet nobody has opened yet is rendered on this device when chosen
 *   (`prepare`), and is then on every device and kept for offline use.
 * - `saveAllForOffline` renders every remaining sheet, for a visit with no signal.
 */
export function useReportSheets(projectNumber: string, reportId: string) {
  const report = useCaReport(projectNumber, reportId);
  const sheetSets = useCaDrawingSets(projectNumber);
  const drawingsHook = useCaDrawings(projectNumber);
  const online = useOnline();
  const { added, refresh: refreshDrawings } = drawingsHook;
  const { renderSheet, sets } = sheetSets;

  const [failed, setFailed] = useState<Record<string, string>>({});
  const [preparing, setPreparing] = useState<Record<string, true>>({});
  const [offlineProgress, setOfflineProgress] = useState<{ done: number; total: number } | null>(null);
  const inFlight = useRef(new Map<string, Promise<void>>());
  const assigned = useRef(false);
  const renamed = useRef(new Set<string>());

  const content = report.content;
  const drawingSet = content?.drawingSet;
  const set = drawingSet ? (sets.find((s) => s.id === drawingSet.setId) ?? null) : null;
  const choices = reportSheetChoices(drawingsHook.drawings, drawingSet, sets);

  // Record the project's current set on a report that has none and was never issued.
  const current = currentSyncedSet(sets);
  const neverIssued = !report.report || report.report.latestRevision === null;
  useEffect(() => {
    if (assigned.current || !report.loaded || !content || content.drawingSet || !current || !neverIssued) return;
    assigned.current = true;
    void report.save({ ...content, drawingSet: reportDrawingSet(current) }).catch(() => {
      assigned.current = false;
    });
  }, [content, current, neverIssued, report]);

  // A sheet named (by AI or an engineer) after its image was made: keep the
  // drawing's own title in step, as printed reports read it.
  useEffect(() => {
    if (!online) return;
    for (const choice of choices) {
      const drawing = drawingsHook.drawings.find((d) => d.id === choice.id);
      if (!drawing || choice.unrendered || renamed.current.has(drawing.id)) continue;
      if (drawing.title === choice.title && (drawing.sheetNumber ?? "") === (choice.sheetNumber ?? "")) continue;
      renamed.current.add(drawing.id);
      void updateCaDrawing(projectNumber, drawing.id, {
        title: choice.title,
        ...(choice.sheetNumber ? { sheetNumber: choice.sheetNumber } : {}),
      }).then(
        () => refreshDrawings(),
        () => undefined,
      );
    }
  }, [choices, drawingsHook.drawings, online, projectNumber, refreshDrawings]);

  /** Renders a sheet nobody has opened yet and adds it as a drawing. */
  const prepare = useCallback(
    (choice: CaSheetChoice): Promise<void> => {
      const running = inFlight.current.get(choice.id);
      if (running) return running;
      const sheet = set?.sheets.find((s) => s.page === choice.page);
      if (!set || !sheet) return Promise.resolve();
      setPreparing((prev) => ({ ...prev, [choice.id]: true }));
      const run = addSetSheetAsDrawing(projectNumber, set, sheet, renderSheet)
        .then(({ drawing, blob }) => added(drawing, blob))
        .then(
          () => undefined,
          (error: unknown) =>
            setFailed((prev) => ({
              ...prev,
              [choice.id]: error instanceof Error ? error.message : "The sheet could not be opened.",
            })),
        )
        .finally(() => {
          inFlight.current.delete(choice.id);
          setPreparing((prev) => {
            const copy = { ...prev };
            delete copy[choice.id];
            return copy;
          });
        });
      inFlight.current.set(choice.id, run);
      return run;
    },
    [added, projectNumber, renderSheet, set],
  );

  /** Renders every sheet of the report's set not yet on this device. */
  async function saveAllForOffline() {
    const todo = choices.filter((c) => c.unrendered);
    setOfflineProgress({ done: 0, total: todo.length });
    for (const [i, choice] of todo.entries()) {
      await prepare(choice);
      setOfflineProgress({ done: i + 1, total: todo.length });
    }
    setOfflineProgress(null);
  }

  /** Lets a failed sheet be tried again. */
  const retry = (id: string) =>
    setFailed((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

  return {
    report,
    sheetSets,
    drawingsHook,
    online,
    /** The report's drawing set, when it has one and this device knows it. */
    set,
    choices,
    prepare,
    preparing,
    failed,
    retry,
    saveAllForOffline,
    offlineProgress,
  };
}
