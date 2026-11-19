"use client";

import { HStack, Spinner, Text } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CaReportList } from "@/components/ca/report/CaReportList";
import { CaReportPrintView } from "@/components/ca/report/CaReportPrintView";
import { CaReportWorkspace } from "@/components/ca/report/CaReportWorkspace";
import { isCaReportStep } from "@/lib/ca/routes";
import { isValidGeneratedId } from "@/lib/validation";

/**
 * The project's reports. One page, views chosen by the query string:
 *
 * - (none)                              the project's reports, grouped by discipline
 * - `?report={id}`                      the report's Report step (the editor)
 * - `?report={id}&step=capture|route`   the report's Capture or Site Route step
 * - `?report={id}&view=print[&rev=N]`   the printable report (draft or issued revision)
 *
 * A single page (rather than a route per report) is what lets a report started
 * offline - whose id no server has seen - open with no signal: this page and
 * its code are already cached. See `caReportPath` in src/lib/ca/routes.ts.
 */
export default function CaReportsPage() {
  return (
    <Suspense
      fallback={
        <HStack gap="3" py="8" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading…</Text>
        </HStack>
      }
    >
      <ReportsView />
    </Suspense>
  );
}

function ReportsView() {
  const params = useSearchParams();
  const reportId = params.get("report");
  const rev = params.get("rev");

  if (!reportId || !isValidGeneratedId(reportId)) return <CaReportList />;
  if (params.get("view") === "print") {
    const revision = rev !== null && /^\d{1,4}$/.test(rev) ? Number(rev) : null;
    return <CaReportPrintView key={`${reportId}:${revision}`} reportId={reportId} revision={revision} />;
  }
  const step = params.get("step");
  return <CaReportWorkspace key={reportId} reportId={reportId} step={isCaReportStep(step) ? step : "report"} />;
}
