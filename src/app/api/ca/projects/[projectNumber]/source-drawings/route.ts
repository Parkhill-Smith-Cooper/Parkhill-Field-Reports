import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaDrawingSource, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/**
 * `GET /api/ca/projects/{p}/source-drawings` — sheets the configured drawing
 * source (mock today, the CA application later) offers for this project,
 * each marked if it has already been imported.
 *
 * `GET ...?ref={externalRef}` streams one sheet's file, which the browser
 * renders to a sheet image and uploads like any drawing. Doing the render in
 * the browser means PDFs from the CA application need no server-side PDF tooling.
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
      return new Response(Buffer.from(file.bytes), {
        headers: {
          "Content-Type": file.contentType,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const [offered, existing] = await Promise.all([
      source.listLatest(p.projectNumber),
      repo.drawings.list(p.projectNumber),
    ]);
    const imported = new Set(existing.map((d) => d.externalRef).filter(Boolean));
    return Response.json({
      source: source.kind,
      drawings: offered.map((d) => ({ ...d, imported: imported.has(d.externalRef) })),
    });
  });
}
