"use client";

import { Box, Collapsible, HStack, Stack, Text } from "@chakra-ui/react";
import { LuChevronDown } from "react-icons/lu";

import type { ObservationForm } from "@/types";

/**
 * The observation, recalled on the middle steps.
 *
 * The engineer is choosing causes and corrective actions minutes after typing
 * the observation, often while walking - having to navigate back to re-read it
 * is exactly the kind of friction that gets an app abandoned in the field.
 *
 * Collapsed by default so it costs no vertical space on a phone, with the
 * equipment and activity always visible in the summary line.
 */
export function ObservationRecap({ form }: { form: ObservationForm }) {
  return (
    <Collapsible.Root>
      <Box borderWidth="1px" borderColor="line" borderRadius="md" bg="surface.muted">
        <Collapsible.Trigger
          width="full"
          textAlign="left"
          px="4"
          py="3"
          cursor="pointer"
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "brand.focusRing",
            outlineOffset: "-2px",
          }}
        >
          <HStack justify="space-between" gap="3">
            <Stack gap="0.5" minW="0">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                Your observation
              </Text>
              <Text fontSize="sm" truncate>
                {form.equipment}
                {form.activity ? ` — ${form.activity}` : ""}
              </Text>
            </Stack>
            <Box
              color="fg.subtle"
              flexShrink="0"
              transition="transform 0.15s"
              css={{
                "[data-state='open'] &": { transform: "rotate(180deg)" },
              }}
            >
              <LuChevronDown />
            </Box>
          </HStack>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <Stack gap="3" px="4" pb="4" pt="1">
            <Text fontSize="sm" whiteSpace="pre-wrap" color="fg">
              {form.observation}
            </Text>
            {form.location && (
              <Text fontSize="xs" color="fg.muted">
                {form.location}
              </Text>
            )}
          </Stack>
        </Collapsible.Content>
      </Box>
    </Collapsible.Root>
  );
}
