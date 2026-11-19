import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { toSummary } from "@/lib/ca/revisions";
import { validateReportContent } from "@/lib/ca/validation";
import { currentUser, currentUserName } from "@/lib/currentUser";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaRepository } from "@/repositories/ca";
import { isCaDiscipline, type CaReportContent } from "@/types/ca";

/**
 * One report.
 *
 * - `GET`: the report (with its working draft) and its issued revisions.
 * - `PUT`: idempotent create-or-save of the draft, keyed by the report id the
 *   device generated. Body: `{ draft, clientUpdatedAt, createdAt, discipline? }`.
 *   The discipline is fixed by the first PUT; later PUTs ignore it. The first
 *   PUT creates the report and assigns its number; later PUTs replace the
 *   draft only if `clientUpdatedAt` is newer (a late, older edit never wins).
 * - `DELETE`: only for a report that has never been issued.
 */

type Params = { params: Promise<{ projectNumber: string; reportId: string }> };

const isIso = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

async function resolve(params: Params["params"]) {
  const p = await projectParam(params);
  if ("error" in p) return p;
  const { reportId } = await params;
  if (!isValidGeneratedId(reportId)) return { error: apiError("Invalid report id.", 400) };
  return { projectNumber: p.projectNumber, reportId };
}

export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the report", async () => {
    const r = await resolve(params);
    if ("error" in r) return r.error;
    const repo = getCaRepository();
    const report = await repo.reports.get(r.projectNumber, r.reportId);
    if (!report) return apiError("That report was not found.", 404);
    const revisions = (await repo.reports.listRevisions(r.projectNumber, r.reportId)).map(toSummary);
    return Response.json({ report, revisions });
  });
}

export async function PUT(request: Request, { params }: Params) {
  return caRoute("save the report", async () => {
    const r = await resolve(params);
    if ("error" in r) return r.error;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return apiError("Invalid request body.", 400);
    const problem = validateReportContent(body.draft);
    if (problem) return apiError(problem, 400);
    if (!isIso(body.clientUpdatedAt) || !isIso(body.createdAt)) {
      return apiError("Invalid report timestamps.", 400);
    }
    if (body.discipline !== undefined && !isCaDiscipline(body.discipline)) {
      return apiError("Invalid discipline.", 400);
    }
    const discipline = isCaDiscipline(body.discipline) ? body.discipline : undefined;
    const draft = body.draft as CaReportContent;

    const repo = getCaRepository();
    if (!(await repo.projects.get(r.projectNumber))) {
      return apiError(`Project ${r.projectNumber} was not found.`, 404);
    }

    const existing = await repo.reports.get(r.projectNumber, r.reportId);
    if (!existing) {
      const report = await repo.reports.create({
        id: r.reportId,
        projectNumber: r.projectNumber,
        ...(discipline ? { discipline } : {}),
        draft,
        latestRevision: null,
        hasUnissuedChanges: false,
        draftUpdatedAt: body.clientUpdatedAt,
        createdAt: body.createdAt,
        createdBy: await currentUser(),
        createdByName: await currentUserName(),
        updatedAt: new Date().toISOString(),
      });
      return Response.json({ report }, { status: 201 });
    }

    const report = await repo.reports.saveDraft(r.projectNumber, r.reportId, draft, body.clientUpdatedAt);
    return Response.json({ report });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return caRoute("delete the report", async () => {
    const r = await resolve(params);
    if ("error" in r) return r.error;
    const result = await getCaRepository().reports.deleteDraft(r.projectNumber, r.reportId);
    if (result === "issued") {
      return apiError("An issued report cannot be deleted. Its revisions are a permanent record.", 409);
    }
    // Deleting is idempotent: a report already gone is fine.
    return Response.json({ deleted: true });
  });
}
