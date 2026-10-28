"use client";

import { Box, Stack, Text } from "@chakra-ui/react";

import { EditableText } from "@/components/EditableText";
import { formatReportDate } from "@/lib/formatDate";

/**
 * One field observation inside the report.
 *
 * Structured Equipment / Date / Observation, in that order, because that is how
 * a commissioning record is read: what it was, when it was seen, what was
 * found. The heading says "Field Observation" rather than "Deficiency" -
 * whether something is a deficiency is a determination the engineer makes, not
 * a label the tool should apply automatically.
 */
export function ReportObservationCard({
  equipment,
  observedDate,
  observation,
  onObservationChange,
}: {
  equipment: string;
  observedDate: string;
  observation: string;
  /** Omit to render read-only, as the saved report does. */
  onObservationChange?: (value: string) => void;
}) {
  return (
    <Box
      data-print="avoid-break"
      borderWidth="1px"
      borderColor="line"
      borderLeftWidth="3px"
      borderLeftColor="brand.solid"
      borderRadius="sm"
      px={{ base: 4, md: 5 }}
      py="4"
    >
      <Stack gap="3">
        <Stack
          data-print-layout="pair"
          direction={{ base: "column", sm: "row" }}
          gap={{ base: 1, sm: 8 }}
        >
          <LabelledValue label="Equipment" value={equipment} />
          <LabelledValue
            label="Date"
            value={formatReportDate(observedDate)}
          />
        </Stack>

        <Stack gap="1">
          <FieldLabel>Observation</FieldLabel>
          {onObservationChange ? (
            <EditableText
              value={observation}
              onChange={onObservationChange}
              label="Field observation"
            />
          ) : (
            <Text fontSize="sm" lineHeight="tall" whiteSpace="pre-wrap">
              {observation}
            </Text>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function LabelledValue({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="0.5" minW="0">
      <FieldLabel>{label}</FieldLabel>
      <Text fontSize="sm" fontWeight="medium">
        {value}
      </Text>
    </Stack>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="2xs"
      fontWeight="bold"
      color="fg.muted"
      textTransform="uppercase"
      letterSpacing="wider"
    >
      {children}
    </Text>
  );
}
