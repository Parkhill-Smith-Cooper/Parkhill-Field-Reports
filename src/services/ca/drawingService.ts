"use client";

import { apiGet, apiGetBlob, apiPatch, apiPutForm } from "@/services/apiClient";
import type { CaSourceDrawing } from "@/lib/ca/contracts";
import type { CaDrawing } from "@/types/ca";

export type CaDrawingWithUrl = CaDrawing & { url: string };

export type DrawingMeta = Pick<
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

export type OfferedDrawing = CaSourceDrawing & { imported: boolean };

const base = (projectNumber: string) => `/api/ca/projects/${encodeURIComponent(projectNumber)}`;

export async function fetchCaDrawings(projectNumber: string): Promise<CaDrawingWithUrl[]> {
  return (await apiGet<{ drawings: CaDrawingWithUrl[] }>(`${base(projectNumber)}/drawings`)).drawings;
}

/** Idempotent: a retry with the same id returns the drawing already stored. */
export async function putCaDrawing(
  projectNumber: string,
  drawingId: string,
  meta: DrawingMeta,
  sheet: Blob,
): Promise<CaDrawingWithUrl> {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  form.append("file", sheet, `sheet.${sheet.type.split("/")[1] ?? "png"}`);
  const { drawing, url } = await apiPutForm<{ drawing: CaDrawing; url: string }>(
    `${base(projectNumber)}/drawings/${encodeURIComponent(drawingId)}`,
    form,
  );
  return { ...drawing, url };
}

export async function updateCaDrawing(
  projectNumber: string,
  drawingId: string,
  patch: Partial<Pick<CaDrawing, "title" | "sheetNumber" | "isCurrent">>,
): Promise<CaDrawingWithUrl> {
  const { drawing, url } = await apiPatch<{ drawing: CaDrawing; url: string }>(
    `${base(projectNumber)}/drawings/${encodeURIComponent(drawingId)}`,
    patch,
  );
  return { ...drawing, url };
}

/** Sheets offered by the configured drawing source (mock today, the CA application later). */
export async function fetchOfferedDrawings(
  projectNumber: string,
): Promise<{ source: "mock" | "ca-app" | null; drawings: OfferedDrawing[] }> {
  return apiGet(`${base(projectNumber)}/source-drawings`);
}

export async function fetchOfferedDrawingFile(projectNumber: string, externalRef: string): Promise<Blob> {
  return apiGetBlob(`${base(projectNumber)}/source-drawings?ref=${encodeURIComponent(externalRef)}`);
}

/** The sheet image bytes, for the offline cache. */
export const downloadDrawingSheet = (url: string) => apiGetBlob(url);
