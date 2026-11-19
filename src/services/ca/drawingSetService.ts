"use client";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiPutForm } from "@/services/apiClient";
import { SET_BLOCK_BYTES, type SetSheet, type SheetNameRequestPage } from "@/lib/ca/sheetIndex";
import type { CaDrawingSet } from "@/types/ca";

/** A stored drawing set, with a short-lived URL to read its PDF. */
export type CaDrawingSetWithUrl = CaDrawingSet & { url: string };

/** Where an imported set came from: the drawing source and its id for the set. */
export type DrawingSetOrigin = Required<Pick<CaDrawingSet, "source" | "externalRef">> &
  Pick<CaDrawingSet, "revisionLabel">;

const base = (projectNumber: string) => `/api/ca/projects/${encodeURIComponent(projectNumber)}/drawing-sets`;
const one = (projectNumber: string, setId: string) => `${base(projectNumber)}/${encodeURIComponent(setId)}`;

export async function fetchDrawingSets(projectNumber: string): Promise<CaDrawingSetWithUrl[]> {
  return (await apiGet<{ sets: CaDrawingSetWithUrl[] }>(base(projectNumber))).sets;
}

/** A block that fails on a flaky connection is retried twice before giving up. */
async function withRetries<T>(send: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 4xx answers (bad file, too large) will not change on a retry.
      if (attempt >= attempts || (status !== undefined && status >= 400 && status < 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Uploads a drawing-set PDF in 8 MB blocks (each a separate, retryable
 * request under the proxy's body limit), then commits it with its sheets.
 * Idempotent on `setId`: running it again after a failure resumes safely.
 */
export async function uploadDrawingSet(
  projectNumber: string,
  setId: string,
  file: File,
  details: { pageCount: number; sheets: SetSheet[]; origin?: DrawingSetOrigin },
  onProgress?: (sentBytes: number, totalBytes: number) => void,
): Promise<CaDrawingSetWithUrl> {
  const blockCount = Math.max(1, Math.ceil(file.size / SET_BLOCK_BYTES));
  for (let index = 0; index < blockCount; index++) {
    const form = new FormData();
    form.append("block", file.slice(index * SET_BLOCK_BYTES, (index + 1) * SET_BLOCK_BYTES), `block-${index}`);
    await withRetries(() => apiPutForm(`${one(projectNumber, setId)}/blocks/${index}`, form));
    onProgress?.(Math.min(file.size, (index + 1) * SET_BLOCK_BYTES), file.size);
  }
  const { set } = await apiPut<{ set: CaDrawingSetWithUrl }>(one(projectNumber, setId), {
    fileName: file.name,
    blockCount,
    pageCount: details.pageCount,
    sheets: details.sheets,
    ...details.origin,
  });
  return set;
}

/** An engineer's correction of one sheet; never overwritten by AI. */
export async function editSetSheet(
  projectNumber: string,
  setId: string,
  edit: { page: number; sheetNumber: string; sheetName: string },
): Promise<CaDrawingSetWithUrl> {
  return (await apiPatch<{ set: CaDrawingSetWithUrl }>(one(projectNumber, setId), edit)).set;
}

/** AI names for up to 8 sheets, saved on the set; returns the updated set. */
export async function nameSetSheets(
  projectNumber: string,
  setId: string,
  pages: SheetNameRequestPage[],
): Promise<CaDrawingSetWithUrl> {
  return (await apiPost<{ set: CaDrawingSetWithUrl }>(`${one(projectNumber, setId)}/sheet-names`, { pages })).set;
}

export async function removeDrawingSet(projectNumber: string, setId: string): Promise<void> {
  await apiDelete(one(projectNumber, setId));
}
