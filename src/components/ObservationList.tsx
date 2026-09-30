"use client";

import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { LuChevronRight, LuImage } from "react-icons/lu";

import { formatReportDate } from "@/lib/formatDate";
import type { SavedObservation } from "@/types";

/**
 * Saved observations for one project.
 *
 * Deliberately structured Equipment / Date / Observation, matching how the
 * report presents each item, so the list and the document read the same way.
 */
export function ObservationList({
  projectNumber,
  observations,
}: {
  projectNumber: string;
  observations: SavedObservation[];
}) {
  return (
    <Stack
      gap="0"
      borderWidth="1px"
      borderColor="line"
      borderRadius="lg"
      overflow="hidden"
    >
      {observations.map((observation, index) => (
        <Box
          key={observation.id}
          asChild
          borderTopWidth={index === 0 ? "0" : "1px"}
          borderColor="line"
          px={{ base: 4, md: 5 }}
          py="4"
          transition="background 0.12s"
          _hover={{ bg: "surface.muted" }}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "brand.focusRing",
            outlineOffset: "-2px",
          }}
        >
          <Link
            href={`/projects/${encodeURIComponent(projectNumber)}/observations/${observation.id}`}
          >
            <HStack justify="space-between" gap="4" align="flex-start">
              <Stack gap="1.5" minW="0">
                <HStack gap="2" wrap="wrap">
                  <Text fontWeight="semibold">{observation.equipment}</Text>
                  <Text fontSize="sm" color="fg.muted">
                    {formatReportDate(observation.observedDate)}
                  </Text>
                  {observation.photos.length > 0 && (
                    <Badge size="sm" variant="subtle" colorPalette="gray">
                      <LuImage />
                      {observation.photos.length}
                    </Badge>
                  )}
                </HStack>

                {observation.activity && (
                  <Text fontSize="sm" color="fg.muted" truncate>
                    {observation.activity}
                  </Text>
                )}

                <Text fontSize="sm" lineClamp={2} color="fg">
                  {observation.observation}
                </Text>
              </Stack>

              <Box color="fg.subtle" flexShrink="0" pt="1">
                <LuChevronRight />
              </Box>
            </HStack>
          </Link>
        </Box>
      ))}
    </Stack>
  );
}
