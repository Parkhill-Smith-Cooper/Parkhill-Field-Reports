import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { scheduleReconcile } from "@/lib/ca/drawingSync";
import { caDrawingSyncDeps, getCaDrawingSource, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/**
 * `POST /api/ca/projects/{p}/drawing-sets/sync` — "Check for updates": asks
 * the CA application for the project's current set now, ignoring the usual
 * interval. Answers 202 at once; `GET .../drawing-sets` shows the result.
 */
export async function POST(_request: Request, { params }: Params) {
  return caRoute("check the CA application for drawings", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    if (!(await getCaRepository().projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    if (!getCaDrawingSource()) return apiError("No drawing source is configured.", 503);
    const sync = scheduleReconcile(caDrawingSyncDeps, p.projectNumber, { force: true });
    after(() => sync.then(() => undefined));
    return Response.json({ syncing: true }, { status: 202 });
  });
}
