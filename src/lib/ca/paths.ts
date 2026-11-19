/**
 * The canonical locations of CA files in the file store (Blob in Azure, local
 * disk in mock mode). Kept in one place so uploads and every later read agree
 * by construction, as `photoBlobPath` does for CX.
 *
 *   {projectNumber}/photos/{photoId}.jpg
 *   {projectNumber}/drawings/{drawingId}.{pdf|png|jpg|webp|svg}
 *   {projectNumber}/drawing-sets/{setId}.pdf
 */

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function caPhotoPath(projectNumber: string, photoId: string): string {
  return `${projectNumber}/photos/${photoId}.jpg`;
}

export function caDrawingPath(
  projectNumber: string,
  drawingId: string,
  extension: string,
): string {
  return `${projectNumber}/drawings/${drawingId}.${extension}`;
}

export function caDrawingSetPath(projectNumber: string, setId: string): string {
  return `${projectNumber}/drawing-sets/${setId}.pdf`;
}

/**
 * True for a relative path made only of safe segments: no `..`, no leading
 * slash, no backslashes. Every file-store call checks this, because the mock
 * store maps paths onto the local disk.
 */
export function isSafeFilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => SEGMENT.test(segment) && !segment.includes(".."));
}

/** A file path belongs to a project only if it sits in that project's folder. */
export function isPathInProject(path: string, projectNumber: string): boolean {
  return isSafeFilePath(path) && path.startsWith(`${projectNumber}/`);
}
