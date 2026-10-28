"use client";

import type { SaveObservationInput, SavedObservation } from "@/types";

import { apiGet, apiPost, apiPut } from "./apiClient";

function base(projectNumber: string): string {
  return `/api/projects/${encodeURIComponent(projectNumber)}/observations`;
}

export async function fetchObservations(
  projectNumber: string,
): Promise<SavedObservation[]> {
  const { observations } = await apiGet<{ observations: SavedObservation[] }>(
    base(projectNumber),
  );
  return observations;
}

export async function fetchObservation(
  projectNumber: string,
  observationId: string,
): Promise<SavedObservation> {
  const { observation } = await apiGet<{ observation: SavedObservation }>(
    `${base(projectNumber)}/${encodeURIComponent(observationId)}`,
  );
  return observation;
}

export async function saveObservation(
  projectNumber: string,
  input: SaveObservationInput,
): Promise<SavedObservation> {
  const { observation } = await apiPost<{ observation: SavedObservation }>(
    base(projectNumber),
    input,
  );
  return observation;
}

export async function updateObservation(
  projectNumber: string,
  input: SaveObservationInput,
): Promise<SavedObservation> {
  const { observation } = await apiPut<{ observation: SavedObservation }>(
    `${base(projectNumber)}/${encodeURIComponent(input.id)}`,
    input,
  );
  return observation;
}
