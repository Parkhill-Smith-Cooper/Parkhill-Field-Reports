import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { caConfig } from "@/lib/ca/config";
import { bearerToken, DRAWING_SYNC_ROLE, verifyServiceToken } from "@/lib/ca/serviceAuth";
import { scheduleSpecReconcile } from "@/lib/ca/specSync";
import { validateDrawingSyncPush } from "@/lib/ca/validation";
import { caSpecSyncDeps } from "@/repositories/ca";

/**
 * `POST /api/ca/integrations/ccr/specifications` — the CA application (ccr)
 * tells Field Reports that a project's Document Control specifications
 * changed: `{ projectNumber, versionId?, event: "published" | "updated" | "removed" }`.
 * `versionId` is absent when one upload published several sections.
 *
 * The drawing-sets push's sibling, with the same trust: no session
 * (`proxy.ts` lets this path through), and an app-only Entra token carrying
 * the `FieldReports.DrawingSync` role from the CA application's identity —
 * the role covers Document Control as a whole.
 *
 * The body only names the project. Field Reports then asks ccr for the
 * current revision of every section and copies what it lacks
 * (`reconcileSpecs`). Answers 202 at once; the copy runs after the response.
 */
export async function POST(request: Request) {
  return caRoute("accept the specifications update", async () => {
    const tenantId = caConfig.caSyncTenantId;
    const audiences = caConfig.caSyncApiAudience.split(",").map((a) => a.trim()).filter(Boolean);
    const allowedClientId = caConfig.caSyncAllowedClientId;
    if (!tenantId || audiences.length === 0 || !allowedClientId) {
      return apiError("Document Control sync is not configured.", 503);
    }

    const auth = await verifyServiceToken(bearerToken(request), {
      tenantId,
      audiences,
      allowedClientId,
      role: DRAWING_SYNC_ROLE,
    });
    if (!auth.ok) {
      console.warn(`[CA] Specifications push refused: ${auth.reason}`);
      return apiError(auth.status === 401 ? "Unauthorized." : "Forbidden.", auth.status);
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateDrawingSyncPush(body);
    if (problem) return apiError(problem, 400);
    const { projectNumber, versionId, event } = body as {
      projectNumber: string;
      versionId?: string;
      event: string;
    };

    console.info(`[CA] Specifications ${event} for ${projectNumber}${versionId ? ` (${versionId})` : ""}; syncing.`);
    after(() => scheduleSpecReconcile(caSpecSyncDeps, projectNumber, { force: true }).then(() => undefined));
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  });
}
