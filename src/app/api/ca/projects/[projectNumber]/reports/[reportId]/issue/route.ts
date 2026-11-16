import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { issueReport } from "@/lib/ca/issueReport";
import { toSummary } from "@/lib/ca/revisions";
import { currentUser } from "@/lib/currentUser";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaRepository } from "@/repositories/ca";

/**
 * `POST /api/ca/projects/{p}/reports/{id}/issue` — freezes the draft as the
 * next immutable revision (Rev 0, 1, 2 …) and stamps Date Issued with the
 * server clock. Body: `{ expectedDraftUpdatedAt }`, the version the engineer
 * reviewed; if the stored draft is a different version, 409.
 *
 * Safe to retry: a repeat after success returns the same revision.
 * 422 when a photo in the report has not finished uploading.
 */

type Params = { params: Promise<{ projectNumber: string; reportId: string }> };

export async function POST(request: Request, { params }: Params) {
  return caRoute("issue the report", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { reportId } = await params;
    if (!isValidGeneratedId(reportId)) return apiError("Invalid report id.", 400);

    const body = (await request.json().catch(() => null)) as { expectedDraftUpdatedAt?: unknown } | null;
    if (!body || typeof body.expectedDraftUpdatedAt !== "string") {
      return apiError("Missing the version of the report you reviewed.", 400);
    }

    const result = await issueReport({
      repo: getCaRepository(),
      projectNumber: p.projectNumber,
      reportId,
      issuedBy: await currentUser(),
      expectedDraftUpdatedAt: body.expectedDraftUpdatedAt,
    });
    if (!result) return apiError("That report was not found.", 404);
    return Response.json({ report: result.report, revision: toSummary(result.revision) });
  });
}
