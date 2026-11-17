"use client";

import { apiGet, apiPut } from "@/services/apiClient";
import type { CaPin } from "@/types/ca";

export type PinBody = Pick<
  CaPin,
  "drawingId" | "x" | "y" | "label" | "note" | "createdAt" | "clientUpdatedAt" | "deleted"
>;

const base = (projectNumber: string) => `/api/ca/projects/${encodeURIComponent(projectNumber)}/pins`;

export async function fetchCaPins(projectNumber: string): Promise<CaPin[]> {
  return (await apiGet<{ pins: CaPin[] }>(base(projectNumber))).pins;
}

/** Idempotent on the device-generated pin id; the newer edit wins. */
export async function putCaPin(projectNumber: string, pinId: string, body: PinBody): Promise<CaPin> {
  return (await apiPut<{ pin: CaPin }>(`${base(projectNumber)}/${encodeURIComponent(pinId)}`, body)).pin;
}
