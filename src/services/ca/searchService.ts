"use client";

import { apiGet } from "@/services/apiClient";
import type { CaSearchResult } from "@/types/ca";

/** Projects and reports matching `query` (2-100 characters). */
export async function searchCa(query: string): Promise<CaSearchResult> {
  return apiGet(`/api/ca/search?q=${encodeURIComponent(query)}`);
}
