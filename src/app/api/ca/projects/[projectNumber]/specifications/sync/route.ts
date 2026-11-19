import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { scheduleSpecReconcile } from "@/lib/ca/specSync";
import { caSpecSyncDeps, getCaRepository, getCaSpecSource } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/**
 * `POST /api/ca/projects/{p}/specifications/sync` — "Check for updates": asks
 * the CA application for the current sections now, ignoring the usual
 * interval. Answers 202 at once; `GET .../specifications` shows the result.
 */
export async function POST(_request: Request, { params }: Params) {
  return caRoute("check the CA application for specifications", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    if (!(await getCaRepository().projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    if (!getCaSpecSource()) return apiError("No Document Control source is configured.", 503);
    const sync = scheduleSpecReconcile(caSpecSyncDeps, p.projectNumber, { force: true });
    after(() => sync.then(() => undefined));
    return Response.json({ syncing: true }, { status: 202 });
  });
}
