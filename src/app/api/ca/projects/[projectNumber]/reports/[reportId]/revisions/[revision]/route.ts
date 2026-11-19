import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";

/**
 * One issued revision, exactly as issued, with short-lived read URLs for the
 * photo and floor-plan files it froze. Read-only: no route changes a revision.
 */

type Params = { params: Promise<{ projectNumber: string; reportId: string; revision: string }> };

export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the issued report", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { reportId, revision: revisionParam } = await params;
    if (!isValidGeneratedId(reportId)) return apiError("Invalid report id.", 400);
    if (!/^\d{1,4}$/.test(revisionParam)) return apiError("Invalid revision.", 400);

    const revision = await getCaRepository().reports.getRevision(
      p.projectNumber,
      reportId,
      Number(revisionParam),
    );
    if (!revision) return apiError("That revision was not found.", 404);

    const files = getCaFileStore();
    const photoUrls = Object.fromEntries(
      await Promise.all(
        Object.entries(revision.photoPaths).map(async ([id, path]) => [id, await files.readUrl(path)] as const),
      ),
    );
    const drawings = new Map(
      (revision.locations ?? []).flatMap((l) => (l.drawing ? [[l.drawing.id, l.drawing.filePath] as const] : [])),
    );
    const drawingUrls = Object.fromEntries(
      await Promise.all([...drawings].map(async ([id, path]) => [id, await files.readUrl(path)] as const)),
    );
    return Response.json({ revision, photoUrls, drawingUrls });
  });
}
