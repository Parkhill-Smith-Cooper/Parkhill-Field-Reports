"use client";

import { Alert, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuArrowLeft, LuPrinter } from "react-icons/lu";

import { CaStateLink } from "@/components/ca/CaStateLink";
import { CaReportDocument } from "@/components/ca/report/CaReportDocument";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaPhotos } from "@/hooks/ca/useCaPhotos";
import { useCaReport } from "@/hooks/ca/useCaReports";
import { caReportPath } from "@/lib/ca/routes";
import { fetchCaRevision } from "@/services/ca/reportService";
import type { CaReportRevision } from "@/types/ca";

/**
 * The printable Field Observation Report.
 *
 * - `rev` given: an issued revision, exactly as issued (content and photos
 *   frozen at issue time, Date Issued from the server). Needs a connection.
 * - no `rev`: a preview of the current draft, marked "DRAFT — NOT ISSUED".
 *
 * "Print / Save as PDF" uses the browser's print dialog. Chrome and Edge
 * print the template's footer and "Page X of Y"; other browsers omit them.
 */
export function CaReportPrintView({ reportId, revision }: { reportId: string; revision: number | null }) {
  const { projectNumber } = useCaProject();

  return (
    <Stack gap="4">
      <Stack direction={{ base: "column", sm: "row" }} gap="2" data-print="hide">
        <Button asChild variant="outline" size="lg">
          <CaStateLink href={caReportPath(projectNumber, reportId)}>
            <LuArrowLeft /> Back to report
          </CaStateLink>
        </Button>
        <Button colorPalette="brand" size="lg" onClick={() => window.print()} data-testid="ca-print-button">
          <LuPrinter /> Print / Save as PDF
        </Button>
      </Stack>
      <Text fontSize="sm" color="fg.muted" data-print="hide">
        Letter size. For the page footer and page numbers use Chrome or Edge, with “Background graphics” on.
      </Text>
      {revision === null ? (
        <DraftView projectNumber={projectNumber} reportId={reportId} />
      ) : (
        <RevisionView projectNumber={projectNumber} reportId={reportId} revision={revision} />
      )}
    </Stack>
  );
}

function Loading({ label = "Preparing the report…" }: { label?: string }) {
  return (
    <HStack gap="3" py="8" justify="center">
      <Spinner size="sm" color="brand.solid" />
      <Text color="fg.muted">{label}</Text>
    </HStack>
  );
}

function DraftView({ projectNumber, reportId }: { projectNumber: string; reportId: string }) {
  const r = useCaReport(projectNumber, reportId);
  const { photos } = useCaPhotos(projectNumber);
  if (!r.loaded || !r.content) return <Loading />;
  const urls = new Map(photos.map((p) => [p.id, p.src]));
  return (
    <CaReportDocument
      content={r.content}
      photoUrl={(id) => urls.get(id) ?? null}
      reportNumber={r.report?.reportNumber ?? null}
      revision={null}
      dateIssued={null}
    />
  );
}

function RevisionView({ projectNumber, reportId, revision }: { projectNumber: string; reportId: string; revision: number }) {
  const [loaded, setLoaded] = useState<{
    key: string;
    data?: { revision: CaReportRevision; photoUrls: Record<string, string> };
    error?: string;
  } | null>(null);
  const key = `${reportId}:${revision}`;
  const current = loaded?.key === key ? loaded : null;

  useEffect(() => {
    let active = true;
    fetchCaRevision(projectNumber, reportId, revision).then(
      (data) => active && setLoaded({ key, data }),
      (error: unknown) =>
        active &&
        setLoaded({ key, error: error instanceof Error ? error.message : "The issued report could not be loaded." }),
    );
    return () => {
      active = false;
    };
  }, [projectNumber, reportId, revision, key]);

  if (!current) return <Loading />;
  if (current.error || !current.data) {
    return (
      <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Description>
          {current.error} Issued reports are loaded from the server, so this needs a connection.
        </Alert.Description>
      </Alert.Root>
    );
  }
  const { revision: rev, photoUrls } = current.data;
  return (
    <CaReportDocument
      content={rev.content}
      photoUrl={(id) => photoUrls[id] ?? null}
      reportNumber={rev.reportNumber}
      revision={rev.revision}
      dateIssued={rev.dateIssued}
    />
  );
}
