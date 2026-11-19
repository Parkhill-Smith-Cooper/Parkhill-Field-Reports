import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string; sectionId: string }> };

/**
 * `GET /api/ca/projects/{p}/specifications/{sectionId}` — one section
 * revision, with a short-lived URL to read its PDF. Superseded revisions stay
 * readable by id: nothing synced is ever deleted.
 */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("open the specification section", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { sectionId } = await params;
    if (!isValidGeneratedId(sectionId)) return apiError("Invalid specification section id.", 400);
    const section = await getCaRepository().specSections.get(p.projectNumber, sectionId);
    if (!section) return apiError("That specification section was not found.", 404);
    return Response.json({ section, url: await getCaFileStore().readUrl(section.filePath) });
  });
}
