import type { CaDrawingView } from "@/hooks/ca/useCaDrawings";
import { untitledSheet } from "@/lib/ca/sheetIndex";
import { drawingsForReport, isSyncedSet, syncedSheetDrawingId } from "@/lib/ca/syncedSets";
import { isSetIndexed, type CaDrawingSet, type CaReportDrawingSet, type CaSetSheet } from "@/types/ca";

/**
 * The floor plans a report offers, in Capture and Site Route.
 *
 * A report started on a synced drawing set lists every sheet of that set,
 * in page order, whether or not anyone has opened it yet: a sheet nobody has
 * opened is `unrendered`, and is rendered on this device when chosen. The
 * set's sheets show as current for this report even after a newer set
 * arrives, because this report was made with them. Drawings added by hand
 * outside a synced set follow. A report without a set shows every drawing,
 * as before.
 */

export type CaSheetChoice = CaDrawingView & {
  /** Listed from the set; no image yet. Rendered on a device when opened. */
  unrendered?: boolean;
};

function placeholder(set: CaDrawingSet, sheet: CaSetSheet): CaSheetChoice {
  return {
    id: syncedSheetDrawingId(set.id, sheet.page),
    projectNumber: set.projectNumber,
    title: sheet.sheetName.trim() || untitledSheet(sheet.page),
    ...(sheet.sheetNumber.trim() ? { sheetNumber: sheet.sheetNumber.trim() } : {}),
    ...(set.revisionLabel ? { revisionLabel: set.revisionLabel } : {}),
    fileType: "pdf",
    page: sheet.page,
    pageCount: set.pageCount,
    originalFileName: set.fileName,
    filePath: "",
    width: 0,
    height: 0,
    source: set.source ?? "upload",
    ...(set.externalRef ? { externalRef: set.externalRef } : {}),
    drawingSetId: set.id,
    isCurrent: true,
    uploadedAt: "",
    uploadedBy: "",
    src: null,
    offlineReady: false,
    unrendered: true,
  };
}

/** The sheet's number and name as the set now has them (AI or an engineer may have named it since). */
export function namedLikeSheet<D extends Pick<CaDrawingView, "title" | "sheetNumber" | "page">>(drawing: D, sheet: CaSetSheet): D {
  return {
    ...drawing,
    title: sheet.sheetName.trim() || drawing.title,
    ...(sheet.sheetNumber.trim() ? { sheetNumber: sheet.sheetNumber.trim() } : {}),
  };
}

export function reportSheetChoices(
  drawings: CaDrawingView[],
  drawingSet: CaReportDrawingSet | undefined,
  sets: CaDrawingSet[],
): CaSheetChoice[] {
  const syncedIds = new Set(sets.filter(isSyncedSet).map((s) => s.id));
  const visible = drawingsForReport(drawings, drawingSet, syncedIds);
  const set = drawingSet ? sets.find((s) => s.id === drawingSet.setId) : undefined;
  if (!set) return visible;

  const ofSet = visible.filter((d) => d.drawingSetId === set.id);
  const byPage = new Map(ofSet.map((d) => [d.page, d]));
  const setSheets: CaSheetChoice[] = isSetIndexed(set)
    ? set.sheets.map((sheet) => {
        const drawing = byPage.get(sheet.page);
        return drawing ? namedLikeSheet({ ...drawing, isCurrent: true }, sheet) : placeholder(set, sheet);
      })
    : ofSet.map((d) => ({ ...d, isCurrent: true }));
  return [...setSheets, ...visible.filter((d) => d.drawingSetId !== set.id)];
}

/**
 * The sheet shown first: one already on the device, else the first that
 * looks like a floor plan, else the first sheet.
 */
export function defaultSheet(choices: CaSheetChoice[]): CaSheetChoice | null {
  return (
    choices.find((d) => !d.unrendered && d.isCurrent) ??
    choices.find((d) => d.isCurrent && /floor\s*plan/i.test(d.title)) ??
    choices.find((d) => d.isCurrent) ??
    choices[0] ??
    null
  );
}
