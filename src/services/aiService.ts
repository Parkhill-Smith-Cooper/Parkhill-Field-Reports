"use client";

import type { ObservationForm, SelectableItem } from "@/types";

import { apiPost } from "./apiClient";

/**
 * Suggestion requests.
 *
 * These call the app's own API routes, which is the whole point of the
 * architecture: the model provider is reached from the server, so no
 * credential is ever present in browser code. When the mocks behind
 * `/api/failure-causes` and `/api/corrective-actions` are replaced with a real
 * model call, this file does not change.
 */

export async function fetchFailureCauses(
  projectNumber: string,
  form: ObservationForm,
): Promise<SelectableItem[]> {
  const { causes } = await apiPost<{ causes: SelectableItem[] }>(
    "/api/failure-causes",
    { projectNumber, ...form },
  );
  return causes;
}

export async function fetchCorrectiveActions(
  projectNumber: string,
  form: ObservationForm,
  selectedCauses: string[],
): Promise<SelectableItem[]> {
  const { actions } = await apiPost<{ actions: SelectableItem[] }>(
    "/api/corrective-actions",
    { projectNumber, ...form, selectedCauses },
  );
  return actions;
}
