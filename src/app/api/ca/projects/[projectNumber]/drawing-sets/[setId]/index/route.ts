import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { CaConflictError } from "@/lib/ca/contracts";
import { liveSet, setParams, withUrl, type DrawingSetParams } from "@/lib/ca/drawingSets";
import type { SetSheet } from "@/lib/ca/sheetIndex";
import { validateDrawingSetIndex } from "@/lib/ca/validation";
import { getCaRepository } from "@/repositories/ca";
import { isSetIndexed } from "@/types/ca";

/**
 * `PUT /api/ca/projects/{p}/drawing-sets/{setId}/index` — a synced set's
 * pages listed as sheets (`{ pageCount, sheets }`). The server stores PDFs
 * without reading them, so the first device to open a synced set reads its
 * title blocks and sends them here. Accepted once: a device that lost the
 * race gets 409 and reloads the set the other one indexed.
 */
export async function PUT(request: Request, { params }: DrawingSetParams) {
  return caRoute("list the drawing set's sheets", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;
    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateDrawingSetIndex(body);
    if (problem) return apiError(problem, 400);
    const b = body as { pageCount: number; sheets: SetSheet[] };

    const found = await liveSet(p.projectNumber, p.setId);
    if (found instanceof Response) return found;
    if (isSetIndexed(found)) throw new CaConflictError("That drawing set's sheets are already listed.");

    let raced = false;
    const set = await getCaRepository().drawingSets.update(p.projectNumber, p.setId, (current) => {
      if (isSetIndexed(current)) {
        raced = true;
        return null;
      }
      return {
        ...current,
        pageCount: b.pageCount,
        sheets: b.sheets.map((s) => ({
          page: s.page,
          sheetNumber: s.sheetNumber.trim(),
          sheetName: s.sheetName.trim(),
          naming: s.naming,
        })),
        indexed: true,
      };
    });
    if (!set) return apiError("That drawing set was not found.", 404);
    if (raced) throw new CaConflictError("That drawing set's sheets are already listed.");
    return Response.json({ set: await withUrl(set) });
  });
}
