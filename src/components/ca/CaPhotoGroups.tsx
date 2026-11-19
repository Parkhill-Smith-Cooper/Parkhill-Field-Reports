"use client";

import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuMapPin } from "react-icons/lu";

import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import { NO_PIN_GROUP, type CaPhotoGroup } from "@/lib/ca/photoGroups";

import { CaPhotoGrid } from "./CaPhotoGrid";

/**
 * The project's photos grouped by the pin they were taken at (drawing order,
 * then pin number), with photos that have no pin last. Each group's header
 * opens its pin, or, while selecting photos for a report, selects the whole
 * group.
 *
 * Groups collapse and expand from their title. Which ones are collapsed is
 * remembered on this device, per project (a convenience only).
 */
export function CaPhotoGroups({
  projectNumber,
  groups,
  selected,
  onOpen,
  onOpenPin,
  onSelectGroup,
}: {
  projectNumber: string;
  groups: CaPhotoGroup<CaPhotoView>[];
  /** In selection mode: the chosen photo ids. */
  selected?: Set<string>;
  onOpen: (photo: CaPhotoView) => void;
  onOpenPin: (pinId: string) => void;
  /** Selection mode: select (true) or clear (false) these photos. */
  onSelectGroup: (photoIds: string[], on: boolean) => void;
}) {
  const storageKey = `ca:collapsed-photo-groups:${projectNumber}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(storageKey));

  function toggle(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage unavailable (private mode, blocked): just not remembered.
    }
  }

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      {groups.map((group) => {
        const ids = group.photos.map((p) => p.id);
        const allOn = Boolean(selected) && ids.every((id) => selected!.has(id));
        const pinned = group.key !== NO_PIN_GROUP;
        const open = !collapsed.has(group.key);
        const panelId = `ca-photo-group-${group.key}`;
        return (
          <Stack key={group.key} gap="2" as="section" aria-label={group.title} data-testid="ca-photo-group">
            <HStack justify="space-between" align="flex-end" gap="3" borderBottomWidth="1px" borderColor="line" pb="2">
              <Box
                as="button"
                display="flex"
                flexDirection="column"
                alignItems="flex-start"
                textAlign="left"
                minW="0"
                flex="1"
                minH="44px"
                justifyContent="center"
                cursor="pointer"
                borderRadius="sm"
                onClick={() => toggle(group.key)}
                aria-expanded={open}
                aria-controls={panelId}
                data-testid="ca-photo-group-toggle"
                _focusVisible={{ outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" }}
              >
                <HStack gap="1.5" fontWeight="semibold" maxW="full">
                  <Box
                    as="span"
                    color="fg.muted"
                    flexShrink={0}
                    transition="transform 0.15s"
                    transform={open ? undefined : "rotate(-90deg)"}
                    aria-hidden
                  >
                    <LuChevronDown />
                  </Box>
                  {pinned && (
                    <Text as="span" color="brand.solid" aria-hidden>
                      <LuMapPin />
                    </Text>
                  )}
                  <Text truncate data-testid="ca-photo-group-title">
                    {group.title}
                  </Text>
                  <Text as="span" color="fg.muted" fontWeight="normal" flexShrink={0}>
                    ({group.photos.length})
                  </Text>
                </HStack>
                {group.subtitle && (
                  <Text fontSize="sm" color="fg.muted" truncate maxW="full" pl="6">
                    {group.subtitle}
                  </Text>
                )}
              </Box>
              {selected ? (
                <Button size="sm" variant="ghost" flexShrink={0} onClick={() => onSelectGroup(ids, !allOn)}>
                  {allOn ? "Deselect" : "Select all"}
                </Button>
              ) : (
                pinned && (
                  <Button size="sm" variant="ghost" flexShrink={0} onClick={() => onOpenPin(group.key)}>
                    Open pin
                  </Button>
                )
              )}
            </HStack>
            <Box id={panelId} hidden={!open}>
              {open && <CaPhotoGrid photos={group.photos} selected={selected} onOpen={onOpen} />}
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}

function readCollapsed(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}
