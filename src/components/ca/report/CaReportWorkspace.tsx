"use client";

import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { LuArrowLeft, LuCamera, LuFileText, LuRoute } from "react-icons/lu";

import { CaStateLink } from "@/components/ca/CaStateLink";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaReport } from "@/hooks/ca/useCaReports";
import { CA_REPORT_STEPS, caProjectPath, caReportPath, type CaReportStep } from "@/lib/ca/routes";
import { CA_DISCIPLINE_LABELS } from "@/types/ca";

import { CaReportCaptureStep } from "./CaReportCaptureStep";
import { CaReportEditorView } from "./CaReportEditorView";
import { CaReportRouteStep } from "./CaReportRouteStep";

const ICONS: Record<CaReportStep, React.ReactNode> = {
  capture: <LuCamera />,
  report: <LuFileText />,
  route: <LuRoute />,
};

/**
 * One report: its title, who started it, and its Capture · Report · Site Route
 * steps. Steps are addressed by query string (`&step=`) and switched with
 * `CaStateLink`, so they work offline for a report no server has seen yet.
 */
export function CaReportWorkspace({ reportId, step }: { reportId: string; step: CaReportStep }) {
  const { projectNumber } = useCaProject();
  const r = useCaReport(projectNumber, reportId);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Stack gap="3" data-print="hide">
        <Button asChild variant="ghost" size="md" alignSelf="flex-start" px="1">
          <CaStateLink href={caProjectPath(projectNumber, "reports")}>
            <LuArrowLeft /> All reports
          </CaStateLink>
        </Button>
        <HStack gap="3" wrap="wrap">
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="semibold" data-testid="ca-report-title">
            {r.report ? `Report ${r.report.reportNumber}` : "New report"}
          </Text>
          {r.discipline && (
            <Badge colorPalette="brand" variant="subtle" size="lg" data-testid="ca-report-discipline">
              {CA_DISCIPLINE_LABELS[r.discipline]}
            </Badge>
          )}
        </HStack>
        {r.createdByName && (
          <Text fontSize="sm" color="fg.muted" data-testid="ca-report-author">
            Started by {r.createdByName}
          </Text>
        )}
      </Stack>

      <CaReportSteps projectNumber={projectNumber} reportId={reportId} step={step} />

      {/* Capture and Site Route save photos and pins under this report's id, so they
          mount only for a report that exists here (on this device or on the server).
          The Report step shows its own "not found" and loading states. */}
      {step !== "report" && (r.notFound || !r.loaded || !r.content) ? (
        <CaReportEditorView reportId={reportId} />
      ) : step === "capture" ? (
        <CaReportCaptureStep reportId={reportId} />
      ) : step === "route" ? (
        <CaReportRouteStep reportId={reportId} />
      ) : (
        <CaReportEditorView reportId={reportId} />
      )}
    </Stack>
  );
}

/** Capture · Report · Site Route. Equal-width, 56px-tall targets: usable with gloves. */
function CaReportSteps({
  projectNumber,
  reportId,
  step,
}: {
  projectNumber: string;
  reportId: string;
  step: CaReportStep;
}) {
  return (
    <HStack
      as="nav"
      aria-label="Report steps"
      data-print="hide"
      gap="0"
      borderBottomWidth="1px"
      borderColor="line"
      mx={{ base: -4, md: 0 }}
    >
      {CA_REPORT_STEPS.map((s) => {
        const active = s.key === step;
        return (
          <Box
            key={s.key}
            asChild
            flex="1"
            minH="56px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderBottomWidth="3px"
            borderColor={active ? "brand.solid" : "transparent"}
            color={active ? "brand.fg" : "fg.muted"}
            fontWeight={active ? "bold" : "medium"}
            _hover={{ color: "brand.fg", bg: "surface.muted" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "brand.focusRing", outlineOffset: "-2px" }}
          >
            <CaStateLink href={caReportPath(projectNumber, reportId, s.key)} aria-current={active ? "page" : undefined}>
              <HStack gap="2">
                <Box aria-hidden fontSize="lg">
                  {ICONS[s.key]}
                </Box>
                <Text fontSize={{ base: "sm", md: "md" }}>{s.label}</Text>
              </HStack>
            </CaStateLink>
          </Box>
        );
      })}
    </HStack>
  );
}
