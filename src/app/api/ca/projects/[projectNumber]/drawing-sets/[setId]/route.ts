import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { liveSet, setParams, withUrl, type DrawingSetParams } from "@/lib/ca/drawingSets";
import { caDrawingSetPath } from "@/lib/ca/paths";
import type { SetSheet } from "@/lib/ca/sheetIndex";
import { validateDrawingSetCommit, validateSetSheetEdit } from "@/lib/ca/validation";
import { currentUser } from "@/lib/currentUser";
import { getCaDrawingSource, getCaFileStore, getCaRepository } from "@/repositories/ca";

/**
 * `PUT /api/ca/projects/{p}/drawing-sets/{setId}` — commits the uploaded
 * blocks as the set's PDF and records the set with its sheets (the device's
 * first sheet-number guesses). Idempotent on the device-generated id.
 *
 * `PATCH` corrects one sheet's number and name; it is marked edited, so AI
 * never overwrites it. `DELETE` hides the set (the file is kept).
 */

type Commit = {
  fileName: string;
  blockCount: number;
  pageCount: number;
  sheets: SetSheet[];
  /** Present when the set was imported from the drawing source. */
  source?: "mock" | "ca-app";
  externalRef?: string;
  revisionLabel?: string;
};

export async function PUT(request: Request, { params }: DrawingSetParams) {
  return caRoute("save the drawing set", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();

    const existing = await repo.drawingSets.get(p.projectNumber, p.setId);
    if (existing) return Response.json({ set: await withUrl(existing) });

    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateDrawingSetCommit(body);
    if (problem) return apiError(problem, 400);
    const b = body as Commit;
    // An imported set must come from the source that is actually wired up.
    if (b.source && getCaDrawingSource()?.kind !== b.source) {
      return apiError("That drawing source is not configured.", 400);
    }

    const filePath = caDrawingSetPath(p.projectNumber, p.setId);
    const { sizeBytes } = await getCaFileStore().commitBlocks(filePath, b.blockCount, "application/pdf");

    const set = await repo.drawingSets.create({
      id: p.setId,
      projectNumber: p.projectNumber,
      fileName: b.fileName.trim(),
      filePath,
      sizeBytes,
      pageCount: b.pageCount,
      sheets: b.sheets.map((s) => ({
        page: s.page,
        sheetNumber: s.sheetNumber.trim(),
        sheetName: s.sheetName.trim(),
        naming: s.naming,
      })),
      uploadedAt: new Date().toISOString(),
      uploadedBy: await currentUser(),
      ...(b.source && b.externalRef
        ? {
            source: b.source,
            externalRef: b.externalRef.trim(),
            ...(b.revisionLabel?.trim() ? { revisionLabel: b.revisionLabel.trim() } : {}),
          }
        : {}),
    });
    return Response.json({ set: await withUrl(set) }, { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: DrawingSetParams) {
  return caRoute("rename the sheet", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;
    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateSetSheetEdit(body);
    if (problem) return apiError(problem, 400);
    const edit = body as { page: number; sheetNumber: string; sheetName: string };

    const found = await liveSet(p.projectNumber, p.setId);
    if (found instanceof Response) return found;
    if (edit.page > found.pageCount) return apiError("That page is not in the set.", 400);

    const set = await getCaRepository().drawingSets.updateSheets(p.projectNumber, p.setId, (sheets) =>
      sheets.map((s) =>
        s.page === edit.page
          ? { ...s, sheetNumber: edit.sheetNumber.trim(), sheetName: edit.sheetName.trim(), naming: "edited" as const }
          : s,
      ),
    );
    if (!set) return apiError("That drawing set was not found.", 404);
    return Response.json({ set: await withUrl(set) });
  });
}

export async function DELETE(_request: Request, { params }: DrawingSetParams) {
  return caRoute("remove the drawing set", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;
    const set = await getCaRepository().drawingSets.remove(p.projectNumber, p.setId, await currentUser());
    if (!set) return apiError("That drawing set was not found.", 404);
    return Response.json({ ok: true });
  });
}
