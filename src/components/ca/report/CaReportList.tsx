"use client";

import { Badge, Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronRight, LuClock, LuPlus, LuUser } from "react-icons/lu";

import { CaReportStateBadge } from "@/components/ca/CaReportStateBadge";
import { CaStateLink } from "@/components/ca/CaStateLink";
import { notifyError } from "@/components/ui/toaster";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaUser } from "@/context/CaUserContext";
import { startCaReport, useCaReports, type CaReportListItem } from "@/hooks/ca/useCaReports";
import { emptyReportContent } from "@/lib/ca/reportContent";
import { formatLongDate } from "@/lib/ca/reportLayout";
import { caNavigate, caReportPath } from "@/lib/ca/routes";
import { hasDeficientItems } from "@/lib/ca/status";
import { CA_DISCIPLINES, CA_DISCIPLINE_LABELS, type CaDiscipline } from "@/types/ca";

const edited = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The project's Field Observation Reports, grouped by Parkhill discipline.
 * Each discipline can start a new report: the draft is saved on this device
 * at once (so leaving by accident loses nothing) with the discipline and the
 * engineer's name, then opens on its Capture step. It gets its report number
 * when it first syncs.
 *
 * Reports started before disciplines existed are listed under "Unassigned".
 */
export function CaReportList() {
  const { projectNumber, project } = useCaProject();
  const { name } = useCaUser();
  const { reports, loaded, serverReachable } = useCaReports(projectNumber);
  const [starting, setStarting] = useState<CaDiscipline | null>(null);

  async function newReport(discipline: CaDiscipline) {
    setStarting(discipline);
    try {
      const content = emptyReportContent(project, name);
      // The project photo carries over from the most recent report.
      const previous = reports.find((r) => r.content.coverPhotoId);
      if (previous) content.coverPhotoId = previous.content.coverPhotoId;
      const id = await startCaReport(projectNumber, content, { discipline, createdByName: name || undefined });
      caNavigate(caReportPath(projectNumber, id, "capture"));
    } catch (error) {
      notifyError("Could not start the report", error);
      setStarting(null);
    }
  }

  const unassigned = reports.filter((r) => !r.discipline);

  return (
    <Stack gap={{ base: 6, md: 8 }}>
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
      ) : (
        <>
          {CA_DISCIPLINES.map((discipline) => (
            <DisciplineSection
              key={discipline}
              discipline={discipline}
              title={CA_DISCIPLINE_LABELS[discipline]}
              projectNumber={projectNumber}
              reports={reports.filter((r) => r.discipline === discipline)}
              starting={starting === discipline}
              disabled={starting !== null}
              onStart={() => void newReport(discipline)}
            />
          ))}
          {unassigned.length > 0 && (
            <DisciplineSection title="Unassigned" projectNumber={projectNumber} reports={unassigned} />
          )}
        </>
      )}
    </Stack>
  );
}

function DisciplineSection({
  discipline,
  title,
  projectNumber,
  reports,
  starting = false,
  disabled = false,
  onStart,
}: {
  discipline?: CaDiscipline;
  title: string;
  projectNumber: string;
  reports: CaReportListItem[];
  starting?: boolean;
  disabled?: boolean;
  /** Absent for the "Unassigned" group, which cannot start reports. */
  onStart?: () => void;
}) {
  const headingId = `ca-discipline-${discipline ?? "unassigned"}`;
  return (
    <Stack as="section" gap="3" aria-labelledby={headingId} data-testid={headingId}>
      <HStack justify="space-between" gap="3" wrap="wrap" borderBottomWidth="1px" borderColor="line" pb="2">
        <HStack gap="2">
          <Text id={headingId} as="h2" fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" color="brand.fg">
            {title}
          </Text>
          <Badge variant="subtle" size="md">
            {reports.length}
          </Badge>
        </HStack>
        {onStart && (
          <Button
            colorPalette="brand"
            size="lg"
            onClick={onStart}
            loading={starting}
            disabled={disabled && !starting}
            data-print="hide"
            aria-label={`Start a new ${title} report`}
          >
            <LuPlus /> Start new report
          </Button>
        )}
      </HStack>
      {reports.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          No {title} reports yet.
        </Text>
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
                {report.reportNumber ? `Report ${report.reportNumber}` : "Draft (not synced yet)"}
              </Text>
              <CaReportStateBadge state={report.state} latestRevision={report.latestRevision} />
              {deficient && (
                <Badge colorPalette="red" variant="solid" size="md">
                  Deficient items
                </Badge>
              )}
            </HStack>
            <HStack gap="1.5" fontSize="sm" color="fg.muted" wrap="wrap">
              {report.createdByName && (
                <>
                  <LuUser aria-hidden />
                  <Text data-testid="ca-report-row-author">Started by {report.createdByName}</Text>
                  <Text aria-hidden>·</Text>
                </>
              )}
              <Text>Last edited {edited(report.updatedAt)}</Text>
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
