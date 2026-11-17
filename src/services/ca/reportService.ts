"use client";

import { apiDelete, apiGet, apiPost, apiPut } from "@/services/apiClient";
import type { CaReport, CaReportContent, CaReportRevision, CaRevisionSummary } from "@/types/ca";

const base = (projectNumber: string) => `/api/ca/projects/${encodeURIComponent(projectNumber)}/reports`;
const one = (projectNumber: string, reportId: string) => `${base(projectNumber)}/${encodeURIComponent(reportId)}`;

export async function fetchCaReports(projectNumber: string): Promise<CaReport[]> {
  return (await apiGet<{ reports: CaReport[] }>(base(projectNumber))).reports;
}

export async function fetchCaReport(
  projectNumber: string,
  reportId: string,
): Promise<{ report: CaReport; revisions: CaRevisionSummary[] }> {
  return apiGet(one(projectNumber, reportId));
}

export type ReportPutBody = { draft: CaReportContent; clientUpdatedAt: string; createdAt: string };

/** Idempotent create-or-save of a draft; an older edit than the stored one is ignored. */
export async function putCaReport(projectNumber: string, reportId: string, body: ReportPutBody): Promise<CaReport> {
  return (await apiPut<{ report: CaReport }>(one(projectNumber, reportId), body)).report;
}

export async function deleteCaReport(projectNumber: string, reportId: string): Promise<void> {
  await apiDelete(one(projectNumber, reportId));
}

export async function issueCaReport(
  projectNumber: string,
  reportId: string,
  expectedDraftUpdatedAt: string,
): Promise<{ report: CaReport; revision: CaRevisionSummary }> {
  return apiPost(`${one(projectNumber, reportId)}/issue`, { expectedDraftUpdatedAt });
}

export async function fetchCaRevision(
  projectNumber: string,
  reportId: string,
  revision: number,
): Promise<{ revision: CaReportRevision; photoUrls: Record<string, string> }> {
  return apiGet(`${one(projectNumber, reportId)}/revisions/${revision}`);
}
