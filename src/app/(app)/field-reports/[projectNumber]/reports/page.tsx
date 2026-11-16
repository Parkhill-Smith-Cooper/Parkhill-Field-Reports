"use client";

import { HStack, Spinner, Text } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CaReportEditorView } from "@/components/ca/report/CaReportEditorView";
import { CaReportList } from "@/components/ca/report/CaReportList";
import { CaReportPrintView } from "@/components/ca/report/CaReportPrintView";
import { isValidGeneratedId } from "@/lib/validation";

/**
 * Reports tab. One page, three views chosen by the query string:
 *
 * - (none)                         the project's reports
 * - `?report={id}`                 the report editor
 * - `?report={id}&view=print[&rev=N]`  the printable report (draft or issued revision)
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
  return <CaReportEditorView key={reportId} reportId={reportId} />;
}
