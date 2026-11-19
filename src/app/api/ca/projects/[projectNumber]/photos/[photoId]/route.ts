import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { caPhotoPath } from "@/lib/ca/paths";
import { validatePhotoMeta } from "@/lib/ca/validation";
import { currentUser } from "@/lib/currentUser";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";
import type { CaPhoto } from "@/types/ca";

/**
 * Idempotent photo sync: `PUT /api/ca/projects/{p}/photos/{photoId}`.
 *
 * The photo id is generated on the device at capture time, so a retried
 * upload (dropped connection, app reopened, "Sync now" tapped twice) always
 * lands on the same record and can never create a duplicate.
 *
 * Multipart body:
 * - `meta` (required): JSON with caption, fileName, takenAt, clientUpdatedAt,
 *   optional pinId, reportId (kept from the first sync), width, height, deleted (a tombstone: the record and file
 *   are kept so the deletion reaches every device and issued reports keep
 *   their copy).
 * - `file` (required the first time only): the JPEG the browser already
 *   downscaled. Ignored once the photo exists - stored files are immutable.
 *
 * The file is written before the record, so a record never points at bytes
 * that are not there; a failure between the two is healed by the retry.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type Params = { params: Promise<{ projectNumber: string; photoId: string }> };

export async function PUT(request: Request, { params }: Params) {
  return caRoute("sync the photo", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { photoId } = await params;
    if (!isValidGeneratedId(photoId)) return apiError("Invalid photo id.", 400);

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }

    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form upload.", 400);

    let meta: unknown;
    try {
      meta = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      return apiError("Photo metadata is missing or malformed.", 400);
    }
    const problem = validatePhotoMeta(meta);
    if (problem) return apiError(problem, 400);
    const m = meta as Pick<
      CaPhoto,
      "caption" | "fileName" | "takenAt" | "clientUpdatedAt" | "pinId" | "reportId" | "width" | "height" | "deleted"
    >;

    const existing = await repo.photos.get(p.projectNumber, photoId);
    const filePath = caPhotoPath(p.projectNumber, photoId);

    // Deleting a photo the server never received: nothing to store.
    if (!existing && m.deleted) return Response.json({ photo: null, url: null });

    if (!existing) {
      const file = form.get("file");
      if (!(file instanceof File)) {
        return apiError("This photo has not been uploaded yet; include the image.", 409);
      }
      // The client re-encodes every photo to JPEG; anything else is refused
      // rather than stored under a `.jpg` name it does not match.
      if (file.type !== "image/jpeg") return apiError("Photos must be JPEG.", 415);
      if (file.size === 0) return apiError("The photo was empty.", 400);
      if (file.size > MAX_UPLOAD_BYTES) return apiError("That photo is too large to upload.", 413);

      await getCaFileStore().put(filePath, new Uint8Array(await file.arrayBuffer()), "image/jpeg");
    }

    const now = new Date().toISOString();
    // The report a photo belongs to is fixed by its first sync.
    const reportId = existing ? existing.reportId : m.reportId || undefined;
    const photo = await repo.photos.upsert({
      id: photoId,
      projectNumber: p.projectNumber,
      filePath,
      fileName: m.fileName.trim().slice(0, 200),
      caption: m.caption,
      takenAt: m.takenAt,
      ...(m.pinId ? { pinId: m.pinId } : {}),
      ...(reportId ? { reportId } : {}),
      ...(m.width ? { width: m.width } : {}),
      ...(m.height ? { height: m.height } : {}),
      ...(m.deleted ? { deleted: true } : {}),
      createdBy: existing?.createdBy ?? (await currentUser()),
      createdAt: existing?.createdAt ?? now,
      clientUpdatedAt: m.clientUpdatedAt,
    });

    return Response.json(
      { photo, url: await getCaFileStore().readUrl(photo.filePath) },
      { status: existing ? 200 : 201 },
    );
  });
}
