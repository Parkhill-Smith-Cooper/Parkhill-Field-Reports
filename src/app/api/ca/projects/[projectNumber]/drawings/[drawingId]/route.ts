import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { caDrawingPath } from "@/lib/ca/paths";
import {
  CA_DRAWING_IMAGE_TYPES,
  CA_DRAWING_MAX_BYTES,
  validateDrawingMeta,
} from "@/lib/ca/validation";
import { currentUser } from "@/lib/currentUser";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaDrawingSource, getCaFileStore, getCaRepository } from "@/repositories/ca";
import type { CaDrawing } from "@/types/ca";

/**
 * `PUT /api/ca/projects/{p}/drawings/{drawingId}` — add a drawing sheet.
 *
 * Idempotent on the device-generated id: a retried upload returns the
 * drawing already stored. Multipart body:
 * - `meta`: JSON (title, sheetNumber?, revisionLabel?, originalFileName,
 *   fileType, page, pageCount, width, height, source, externalRef?).
 * - `file`: the sheet IMAGE (PNG/JPEG/WebP). PDFs are rendered to an image in
 *   the browser before upload, so the server never parses PDFs.
 *
 * `PATCH` renames a sheet or marks it superseded (`isCurrent: false`).
 * Drawings are never deleted: pins on them stay meaningful in old reports.
 */

type Params = { params: Promise<{ projectNumber: string; drawingId: string }> };

type Meta = Pick<
  CaDrawing,
  | "title"
  | "sheetNumber"
  | "revisionLabel"
  | "originalFileName"
  | "fileType"
  | "page"
  | "pageCount"
  | "width"
  | "height"
  | "source"
  | "externalRef"
  | "drawingSetId"
>;

export async function PUT(request: Request, { params }: Params) {
  return caRoute("add the drawing", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { drawingId } = await params;
    if (!isValidGeneratedId(drawingId)) return apiError("Invalid drawing id.", 400);

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    const files = getCaFileStore();

    const existing = await repo.drawings.get(p.projectNumber, drawingId);
    if (existing) {
      return Response.json({ drawing: existing, url: await files.readUrl(existing.filePath) });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form upload.", 400);
    let meta: unknown;
    try {
      meta = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      return apiError("Drawing details are missing or malformed.", 400);
    }
    const problem = validateDrawingMeta(meta);
    if (problem) return apiError(problem, 400);
    const m = meta as Meta;

    // An "imported" drawing must come from the source that is actually wired up.
    if (m.source !== "upload" && getCaDrawingSource()?.kind !== m.source) {
      return apiError("That drawing source is not configured.", 400);
    }

    // A sheet from an uploaded set must come from a set of this project.
    if (m.drawingSetId && !(await repo.drawingSets.get(p.projectNumber, m.drawingSetId))) {
      return apiError("That drawing set was not found.", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) return apiError("Include the drawing image.", 400);
    const extension = CA_DRAWING_IMAGE_TYPES[file.type as keyof typeof CA_DRAWING_IMAGE_TYPES];
    if (!extension) return apiError("Drawing images must be PNG, JPEG or WebP.", 415);
    if (file.size === 0) return apiError("The drawing file was empty.", 400);
    if (file.size > CA_DRAWING_MAX_BYTES) return apiError("That drawing is too large (25 MB maximum).", 413);

    const filePath = caDrawingPath(p.projectNumber, drawingId, extension);
    if (!(await files.exists(filePath))) {
      await files.put(filePath, new Uint8Array(await file.arrayBuffer()), file.type);
    }

    const drawing = await repo.drawings.upsert({
      id: drawingId,
      projectNumber: p.projectNumber,
      title: m.title.trim(),
      ...(m.sheetNumber?.trim() ? { sheetNumber: m.sheetNumber.trim() } : {}),
      ...(m.revisionLabel?.trim() ? { revisionLabel: m.revisionLabel.trim() } : {}),
      fileType: m.fileType,
      page: m.page,
      pageCount: m.pageCount,
      originalFileName: m.originalFileName.trim(),
      filePath,
      width: m.width,
      height: m.height,
      source: m.source,
      ...(m.externalRef ? { externalRef: m.externalRef } : {}),
      ...(m.drawingSetId ? { drawingSetId: m.drawingSetId } : {}),
      isCurrent: true,
      uploadedAt: new Date().toISOString(),
      uploadedBy: await currentUser(),
    });
    return Response.json({ drawing, url: await files.readUrl(filePath) }, { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return caRoute("update the drawing", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { drawingId } = await params;
    if (!isValidGeneratedId(drawingId)) return apiError("Invalid drawing id.", 400);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return apiError("Invalid request body.", 400);

    const repo = getCaRepository();
    const existing = await repo.drawings.get(p.projectNumber, drawingId);
    if (!existing) return apiError("That drawing was not found.", 404);

    const next: CaDrawing = { ...existing };
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200) {
        return apiError("A drawing title is required (200 characters or fewer).", 400);
      }
      next.title = body.title.trim();
    }
    if (body.sheetNumber !== undefined) {
      if (typeof body.sheetNumber !== "string" || body.sheetNumber.length > 60) {
        return apiError("Invalid sheet number.", 400);
      }
      next.sheetNumber = body.sheetNumber.trim() || undefined;
    }
    if (body.isCurrent !== undefined) {
      if (typeof body.isCurrent !== "boolean") return apiError("Invalid drawing state.", 400);
      next.isCurrent = body.isCurrent;
    }

    const drawing = await repo.drawings.upsert(next);
    return Response.json({ drawing, url: await getCaFileStore().readUrl(drawing.filePath) });
  });
}
