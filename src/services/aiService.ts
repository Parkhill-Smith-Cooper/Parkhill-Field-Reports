"use client";

import type {
  ObservationForm,
  ObservationPhoto,
  SelectableItem,
} from "@/types";

import { apiPost } from "./apiClient";

/**
 * Suggestion requests.
 *
 * These call the app's own API routes, which is the whole point of the
 * architecture: the model provider is reached from the server, so no
 * credential is ever present in browser code. Photos are sent as blob paths;
 * the server reads the images itself.
 */

export async function fetchFailureCauses(
  projectNumber: string,
  form: ObservationForm,
  photos: ObservationPhoto[],
): Promise<SelectableItem[]> {
  const { causes } = await apiPost<{ causes: SelectableItem[] }>(
    "/api/failure-causes",
    { projectNumber, ...form, photoPaths: photos.map((photo) => photo.blobPath) },
  );
  return causes;
}

export async function fetchCorrectiveActions(
  projectNumber: string,
  form: ObservationForm,
  photos: ObservationPhoto[],
  selectedCauses: string[],
): Promise<SelectableItem[]> {
  const { actions } = await apiPost<{ actions: SelectableItem[] }>(
    "/api/corrective-actions",
    {
      projectNumber,
      ...form,
      photoPaths: photos.map((photo) => photo.blobPath),
      selectedCauses,
    },
  );
  return actions;
}
