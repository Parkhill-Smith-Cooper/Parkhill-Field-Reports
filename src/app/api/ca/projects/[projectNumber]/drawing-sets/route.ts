import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { isSyncing, scheduleReconcile } from "@/lib/ca/drawingSync";
import { withUrl } from "@/lib/ca/drawingSets";
import { caDrawingSyncDeps, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** How long a listing waits for a sync it started before answering anyway. */
const WAIT_FOR_SYNC_MS = 8_000;

/**
 * `GET /api/ca/projects/{p}/drawing-sets` — the project's drawing sets
 * (removed ones left out), each with its sheets and a short-lived URL to
 * read the PDF. Every device sees the same sets and sheet names.
 *
 * Listing also keeps the project's set in step with the CA application
 * (`reconcile`, at most every few minutes). A quick sync is waited for, so
 * the first visit usually shows the set straight away; a long one (a big
 * PDF) carries on after the response, and `syncing: true` tells the device
 * to ask again shortly.
 */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the drawing sets", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }

    const sync = scheduleReconcile(caDrawingSyncDeps, p.projectNumber);
    after(() => sync.then(() => undefined));
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([sync, new Promise((resolve) => (timer = setTimeout(resolve, WAIT_FOR_SYNC_MS)))]);
    clearTimeout(timer);

    const sets = (await repo.drawingSets.list(p.projectNumber)).filter((s) => !s.removed);
    return Response.json({
      sets: await Promise.all(sets.map(withUrl)),
      syncing: isSyncing(p.projectNumber),
    });
  });
}
