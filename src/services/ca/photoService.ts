"use client";

import { apiGet, apiPutForm } from "@/services/apiClient";
import type { CaPhoto } from "@/types/ca";

export type CaPhotoWithUrl = CaPhoto & { url: string };

const base = (projectNumber: string) =>
  `/api/ca/projects/${encodeURIComponent(projectNumber)}/photos`;

export async function fetchCaPhotos(projectNumber: string): Promise<CaPhotoWithUrl[]> {
  return (await apiGet<{ photos: CaPhotoWithUrl[] }>(base(projectNumber))).photos;
}

export type PhotoMeta = Pick<
  CaPhoto,
  "caption" | "fileName" | "takenAt" | "clientUpdatedAt" | "pinId" | "width" | "height"
>;

/**
 * Idempotent upload/update of one photo. Send `file` until the server has
 * acknowledged the photo once; afterwards metadata alone is enough.
 */
export async function putCaPhoto(
  projectNumber: string,
  photoId: string,
  meta: PhotoMeta,
  file?: Blob,
): Promise<CaPhotoWithUrl> {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  if (file) form.append("file", file, "photo.jpg");
  const { photo, url } = await apiPutForm<{ photo: CaPhoto; url: string }>(
    `${base(projectNumber)}/${encodeURIComponent(photoId)}`,
    form,
  );
  return { ...photo, url };
}
