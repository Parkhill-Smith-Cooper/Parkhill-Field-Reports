"use client";

import { Badge, Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { CaStateLink } from "@/components/ca/CaStateLink";
import { useState } from "react";
import { LuChevronRight, LuClock, LuFileText, LuPlus } from "react-icons/lu";

import { CaReportStateBadge } from "@/components/ca/CaReportStateBadge";
import { EmptyState } from "@/components/EmptyState";
import { notifyError } from "@/components/ui/toaster";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaUser } from "@/context/CaUserContext";
import { startCaReport, useCaReports, type CaReportListItem } from "@/hooks/ca/useCaReports";
import { emptyReportContent } from "@/lib/ca/reportContent";
import { formatLongDate } from "@/lib/ca/reportLayout";
import { caNavigate, caReportPath } from "@/lib/ca/routes";
import { hasDeficientItems } from "@/lib/ca/status";

/**
 * Reports tab: the project's Field Observation Reports, newest first, with
 * their state (Draft, Issued Rev N, or being revised). A new report can be
 * started offline; it gets its number when it first syncs.
 */
export function CaReportList() {
  const { projectNumber, project } = useCaProject();
  const { name } = useCaUser();
  const { reports, loaded, serverReachable } = useCaReports(projectNumber);
  const [starting, setStarting] = useState(false);

  async function newReport() {
    setStarting(true);
    try {
      const content = emptyReportContent(project, name);
      // The project photo carries over from the most recent report.
      const previous = reports.find((r) => r.content.coverPhotoId);
      if (previous) content.coverPhotoId = previous.content.coverPhotoId;
      const id = await startCaReport(projectNumber, content);
      caNavigate(caReportPath(projectNumber, id));
    } catch (error) {
      notifyError("Could not start the report", error);
      setStarting(false);
    }
  }

  return (
    <Stack gap="4">
      <Button colorPalette="brand" size="xl" minH="64px" onClick={newReport} loading={starting} data-print="hide">
        <LuPlus /> New report
      </Button>
      <Text fontSize="sm" color="fg.muted">
        Tip: on the Capture tab, select photos and choose “Create report” to start a report with them already in it.
      </Text>
      {!serverReachable && (
        <Text fontSize="sm" color="fg.muted">
          Offline — showing reports on this device.
        </Text>
      )}

      {!loaded ? (
        <HStack gap="3" py="6" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading reports…</Text>
        </HStack>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<LuFileText />}
          title="No reports yet"
          description="Start a Field Observation Report for a site visit. It saves on this device as you type."
        />
      ) : (
        <Stack gap="2" data-testid="ca-report-list">
          {reports.map((r) => (
            <ReportRow key={r.id} projectNumber={projectNumber} report={r} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ReportRow({ projectNumber, report }: { projectNumber: string; report: CaReportListItem }) {
  const deficient = hasDeficientItems(report.content.items);
  return (
    <Box
      asChild
      borderWidth="1px"
      borderColor="line"
      borderRadius="md"
      p={{ base: 3, md: 4 }}
      _hover={{ borderColor: "brand.solid" }}
      data-testid="ca-report-row"
    >
      <CaStateLink href={caReportPath(projectNumber, report.id)}>
        <HStack justify="space-between" gap="3">
          <Stack gap="1" minW="0">
            <HStack gap="2" wrap="wrap">
              <Text fontWeight="semibold" color="brand.fg">
                Report {report.reportNumber ?? "(not synced yet)"}
              </Text>
              <CaReportStateBadge state={report.state} latestRevision={report.latestRevision} />
              {deficient && (
                <Badge colorPalette="red" variant="solid" size="md">
                  Deficient items
                </Badge>
              )}
            </HStack>
            <Text fontSize="sm" color="fg.muted">
              Visited {formatLongDate(report.content.dateVisited) || "—"} · {report.content.items.length} item
              {report.content.items.length === 1 ? "" : "s"}
            </Text>
            {report.syncState !== "synced" && (
              <HStack gap="1" fontSize="sm" color="orange.600">
                <LuClock aria-hidden />
                <Text>{report.syncState === "error" ? "Upload failed" : "Saved on this device — waiting to upload"}</Text>
              </HStack>
            )}
          </Stack>
          <LuChevronRight aria-hidden />
        </HStack>
      </CaStateLink>
    </Box>
  );
}
