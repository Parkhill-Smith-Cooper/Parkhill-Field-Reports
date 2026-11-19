"use client";

import type { PreparedSheet } from "@/lib/ca/drawingSheet";
import { newCaDrawingId } from "@/lib/ca/ids";
import { untitledSheet } from "@/lib/ca/sheetIndex";
import { isSyncedSet, syncedSheetDrawingId } from "@/lib/ca/syncedSets";
import { putCaDrawing, type CaDrawingWithUrl, type DrawingMeta } from "@/services/ca/drawingService";
import type { CaDrawingSet, CaSetSheet } from "@/types/ca";

/**
 * Makes one sheet of a drawing set into a drawing: the page is rendered to
 * an image on this device and uploaded with its sheet number and name.
 *
 * A sheet of a set synced from the CA application gets an id derived from
 * the set and page, and the set's origin. So two devices opening the same
 * sheet at once make one drawing, and every device finds it. A sheet of a
 * set uploaded by hand keeps a new random id, as before.
 */
export async function addSetSheetAsDrawing(
  projectNumber: string,
  set: Pick<CaDrawingSet, "id" | "fileName" | "pageCount" | "source" | "externalRef" | "revisionLabel">,
  sheet: CaSetSheet,
  render: (setId: string, page: number) => Promise<PreparedSheet>,
): Promise<{ drawing: CaDrawingWithUrl; blob: Blob }> {
  const rendered = await render(set.id, sheet.page);
  const synced = isSyncedSet(set);
  const meta: DrawingMeta = {
    title: sheet.sheetName.trim() || untitledSheet(sheet.page),
    ...(sheet.sheetNumber.trim() ? { sheetNumber: sheet.sheetNumber.trim() } : {}),
    ...(synced && set.revisionLabel ? { revisionLabel: set.revisionLabel.slice(0, 60) } : {}),
    originalFileName: set.fileName,
    fileType: "pdf",
    page: sheet.page,
    pageCount: set.pageCount,
    width: rendered.width,
    height: rendered.height,
    source: synced ? set.source! : "upload",
    ...(synced ? { externalRef: set.externalRef! } : {}),
    drawingSetId: set.id,
  };
  const id = synced ? syncedSheetDrawingId(set.id, sheet.page) : newCaDrawingId();
  const drawing = await putCaDrawing(projectNumber, id, meta, rendered.blob);
  return { drawing, blob: rendered.blob };
}
