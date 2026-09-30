"use client";

import { downscaleImage } from "@/lib/downscaleImage";
import type { ObservationPhoto } from "@/types";

import { apiPost, apiPostForm } from "./apiClient";

/**
 * Field photo upload and read URLs.
 *
 * The downscale happens here rather than in the component, so every upload
 * path in the app gets it automatically and no caller can forget.
 */
export async function uploadPhoto(
  projectNumber: string,
  observationId: string,
  file: File,
): Promise<ObservationPhoto> {
  const { blob } = await downscaleImage(file);

  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  form.append("observationId", observationId);
  // The original name is kept for display only - the server builds the path.
  form.append("fileName", file.name);

  const { photo } = await apiPostForm<{ photo: ObservationPhoto }>(
    `/api/projects/${encodeURIComponent(projectNumber)}/photos`,
    form,
  );
  return photo;
}

/**
 * Short-lived read URLs for a batch of photos.
 *
 * Batched deliberately: a report with eight photos costs one request rather
 * than eight, and every URL in the batch then expires together.
 */
export async function fetchPhotoUrls(
  projectNumber: string,
  blobPaths: string[],
): Promise<Record<string, string>> {
  if (blobPaths.length === 0) return {};

  const { urls } = await apiPost<{ urls: Record<string, string> }>(
    `/api/projects/${encodeURIComponent(projectNumber)}/photos/sas`,
    { blobPaths },
  );
  return urls;
}
