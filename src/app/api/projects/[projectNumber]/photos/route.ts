import { photoBlobPath, uploadPhoto } from "@/lib/azure/blob";
import { apiError, handleRoute } from "@/lib/apiResponse";
import { newPhotoId } from "@/lib/ids";
import { isValidGeneratedId, isValidProjectNumber } from "@/lib/validation";
import { getProject } from "@/repositories/projectRepository";
import type { ObservationPhoto } from "@/types";

/**
 * Field photo upload.
 *
 * The browser has already downscaled and re-encoded the image to JPEG, so this
 * handler deals in a few hundred kilobytes rather than the several megabytes
 * that come off a phone camera. The cap below is a guard against a client that
 * skipped that step, not the expected size.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("upload the photo", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }
    if (!(await getProject(projectNumber))) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return apiError("Expected a multipart form upload.", 400);
    }

    const file = form.get("file");
    const observationId = form.get("observationId");

    if (!(file instanceof File)) {
      return apiError("No photo was included in the upload.", 400);
    }
    if (typeof observationId !== "string" || !isValidGeneratedId(observationId)) {
      return apiError("Invalid observation id.", 400);
    }
    if (!file.type.startsWith("image/")) {
      return apiError("Only image files can be uploaded.", 415);
    }
    if (file.size === 0) {
      return apiError("The photo was empty.", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError("That photo is too large to upload.", 413);
    }

    const photoId = newPhotoId();
    const blobPath = photoBlobPath(projectNumber, observationId, photoId);

    // The client re-encodes every photo to JPEG before uploading, and the blob
    // path is `.jpg`, so the stored content type is fixed rather than taken
    // from the request. Trusting a client-supplied type here would let the
    // stored type disagree with the extension and the actual bytes.
    await uploadPhoto(
      blobPath,
      Buffer.from(await file.arrayBuffer()),
      "image/jpeg",
    );

    // The original file name is kept for the engineer's benefit (it is what
    // they will recognise in the report), but never used to build a path.
    const originalName = form.get("fileName");
    const photo: ObservationPhoto = {
      id: photoId,
      blobPath,
      fileName:
        typeof originalName === "string" && originalName.trim().length > 0
          ? originalName.trim().slice(0, 200)
          : file.name,
    };

    return Response.json({ photo }, { status: 201 });
  });
}
