import { apiError } from "@/lib/apiResponse";
import { suggestSheetNames } from "@/lib/ai/sheetNames";
import { caRoute } from "@/lib/ca/apiRoute";
import { liveSet, setParams, withUrl, type DrawingSetParams } from "@/lib/ca/drawingSets";
import { applySheetNames, type SheetNameRequestPage } from "@/lib/ca/sheetIndex";
import { validateSheetNameRequest } from "@/lib/ca/validation";
import { getCaRepository } from "@/repositories/ca";

/**
 * `POST /api/ca/projects/{p}/drawing-sets/{setId}/sheet-names` — names up to
 * 8 sheets of the set with AI, from each page's title-block text (or a
 * title-block image for a scanned page), and saves the names on the set.
 * Sheets an engineer has edited keep their values. 503 when AI is not
 * configured; the device's guesses then stay and engineers name sheets by hand.
 */
export async function POST(request: Request, { params }: DrawingSetParams) {
  return caRoute("name the drawing sheets", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;

    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateSheetNameRequest(body);
    if (problem) return apiError(problem, 400);
    const pages = (body as { pages: SheetNameRequestPage[] }).pages;

    const found = await liveSet(p.projectNumber, p.setId);
    if (found instanceof Response) return found;
    if (pages.some((page) => page.page > found.pageCount)) return apiError("That page is not in the set.", 400);

    const results = await suggestSheetNames(pages);
    const set = await getCaRepository().drawingSets.updateSheets(p.projectNumber, p.setId, (sheets) =>
      applySheetNames(sheets, results),
    );
    if (!set) return apiError("That drawing set was not found.", 404);
    return Response.json({ set: await withUrl(set) });
  });
}
