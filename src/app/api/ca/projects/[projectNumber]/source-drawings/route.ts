import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaDrawingSource, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/**
 * `GET /api/ca/projects/{p}/source-drawings` — what the configured drawing
 * source (the CA application's Document Control, or mock sheets) offers for
 * this project, each marked if it has already been imported: as a drawing
 * (a sheet) or as a drawing set still on the project (a PDF).
 *
 * `GET ...?ref={externalRef}` streams one file. The browser reads it: a PDF
 * becomes a drawing set (pages listed as sheets), an image becomes a drawing.
 * Doing that in the browser means no server-side PDF tooling.
 */
export async function GET(request: Request, { params }: Params) {
  return caRoute("load drawings from the CA application", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    const source = getCaDrawingSource();
    if (!source) return Response.json({ source: null, drawings: [] });

    const ref = new URL(request.url).searchParams.get("ref");
    if (ref !== null) {
      if (ref.length === 0 || ref.length > 300) return apiError("Invalid drawing reference.", 400);
      // Only sheets the source itself offers for this project can be fetched.
      const offered = await source.listLatest(p.projectNumber);
      if (!offered.some((d) => d.externalRef === ref)) return apiError("That drawing was not found.", 404);
      const file = await source.fetchFile(p.projectNumber, ref);
      return new Response(file.bytes instanceof Uint8Array ? Buffer.from(file.bytes) : file.bytes, {
        headers: {
          "Content-Type": file.contentType,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const [offered, existing, sets] = await Promise.all([
      source.listLatest(p.projectNumber),
      repo.drawings.list(p.projectNumber),
      repo.drawingSets.list(p.projectNumber),
    ]);
    const imported = new Set(
      [
        ...existing.map((d) => d.externalRef),
        // A removed set can be imported again.
        ...sets.filter((s) => !s.removed && s.source === source.kind).map((s) => s.externalRef),
      ].filter(Boolean),
    );
    return Response.json({
      source: source.kind,
      drawings: offered.map((d) => ({ ...d, imported: imported.has(d.externalRef) })),
    });
  });
}
