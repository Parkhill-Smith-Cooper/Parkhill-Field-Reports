"use client";

import { Badge, Box, Button, HStack, Image, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuCheck, LuMapPin } from "react-icons/lu";

import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import type { CaPhotoGroup } from "@/lib/ca/photoGroups";
import { localDay } from "@/lib/ca/siteRoute";
import { formatLongDate } from "@/lib/ca/reportLayout";

import { clearDropHighlights, setDraggedPhotos } from "./photoDrag";

type Filter = "auto" | "day" | "all";

/**
 * The report editor's photo panel: the project's photos grouped by the pin
 * they were taken at. Click photos to select them, then drag them onto any
 * photo box in the report (dragging an unselected photo drags just that one).
 *
 * By default it shows the photos taken on the report's Date Visited, or every
 * photo when none were taken that day.
 */
export function CaReportPhotoPanel({
  groups,
  dateVisited,
  usedIds,
}: {
  groups: CaPhotoGroup<CaPhotoView>[];
  /** `yyyy-mm-dd`; may be empty. */
  dateVisited: string;
  /** Photos already placed in this report. */
  usedIds: Set<string>;
}) {
  const [filter, setFilter] = useState<Filter>("auto");
  const [selected, setSelected] = useState<string[]>([]);

  const onDay = (p: CaPhotoView) => localDay(p.takenAt) === dateVisited;
  const dayCount = dateVisited ? groups.reduce((n, g) => n + g.photos.filter(onDay).length, 0) : 0;
  const totalCount = groups.reduce((n, g) => n + g.photos.length, 0);
  const effective = filter === "auto" ? (dayCount > 0 ? "day" : "all") : filter;
  const shown = (effective === "day" ? groups.map((g) => ({ ...g, photos: g.photos.filter(onDay) })) : groups).filter(
    (g) => g.photos.length > 0,
  );
  const shownIds = shown.flatMap((g) => g.photos.map((p) => p.id));
  // Keep the selection to photos still on screen, in the panel's order.
  const selection = shownIds.filter((id) => selected.includes(id));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleGroup = (ids: string[]) =>
    setSelected((s) => (ids.every((id) => s.includes(id)) ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]));

  return (
    <Stack gap="3" data-testid="ca-report-photo-panel" aria-label="Report photos">
      <Stack gap="1">
        <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="wider">
          Photos
        </Text>
        <Text fontSize="xs" color="fg.muted">
          Select photos, then drag them onto a photo box in the report.
        </Text>
      </Stack>

      <HStack gap="1" role="group" aria-label="Which photos">
        <Button
          size="xs"
          variant={effective === "day" ? "solid" : "outline"}
          colorPalette={effective === "day" ? "brand" : "gray"}
          disabled={!dateVisited}
          aria-pressed={effective === "day"}
          onClick={() => setFilter("day")}
          title={dateVisited ? `Photos taken ${formatLongDate(dateVisited)}` : "Set the Date Visited first"}
        >
          Visit day ({dayCount})
        </Button>
        <Button
          size="xs"
          variant={effective === "all" ? "solid" : "outline"}
          colorPalette={effective === "all" ? "brand" : "gray"}
          aria-pressed={effective === "all"}
          onClick={() => setFilter("all")}
        >
          All ({totalCount})
        </Button>
      </HStack>

      {selection.length > 0 && (
        <HStack justify="space-between" fontSize="sm" data-testid="ca-panel-selection">
          <Text fontWeight="medium">{selection.length} selected</Text>
          <Button size="xs" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </HStack>
      )}

      {shown.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          {totalCount === 0 ? "No photos in this project yet. Take some on the Capture tab." : "No photos taken on the visit day."}
        </Text>
      ) : (
        <Stack gap="4">
          {shown.map((group) => {
            const ids = group.photos.map((p) => p.id);
            const allOn = ids.every((id) => selection.includes(id));
            return (
              <Stack key={group.key} gap="2" data-testid="ca-panel-group">
                <HStack justify="space-between" align="flex-start" gap="2">
                  <Stack gap="0" minW="0">
                    <HStack gap="1" fontSize="sm" fontWeight="semibold">
                      {group.key !== "none" && <LuMapPin aria-hidden />}
                      <Text truncate data-testid="ca-panel-group-title">
                        {group.title}
                      </Text>
                      <Text color="fg.muted" fontWeight="normal">
                        ({group.photos.length})
                      </Text>
                    </HStack>
                    {group.subtitle && (
                      <Text fontSize="xs" color="fg.muted" truncate>
                        {group.subtitle}
                      </Text>
                    )}
                  </Stack>
                  <Button size="2xs" variant="ghost" flexShrink={0} onClick={() => toggleGroup(ids)}>
                    {allOn ? "Deselect" : "Select all"}
                  </Button>
                </HStack>
                <SimpleGrid columns={2} gap="2">
                  {group.photos.map((photo) => {
                    const on = selection.includes(photo.id);
                    return (
                      <Box
                        key={photo.id}
                        // A div, not a <button>: Firefox cannot drag buttons.
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event: React.KeyboardEvent) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggle(photo.id);
                          }
                        }}
                        draggable
                        onDragStart={(event: React.DragEvent) =>
                          setDraggedPhotos(event, on ? selection : [photo.id])
                        }
                        onDragEnd={(event: React.DragEvent) => {
                          clearDropHighlights();
                          if (event.dataTransfer.dropEffect !== "none") setSelected([]);
                        }}
                        onClick={() => toggle(photo.id)}
                        aria-pressed={on}
                        aria-label={`${photo.caption || photo.fileName}${usedIds.has(photo.id) ? " (in report)" : ""}`}
                        data-testid="ca-panel-photo"
                        position="relative"
                        borderRadius="md"
                        overflow="hidden"
                        borderWidth="3px"
                        borderColor={on ? "brand.solid" : "transparent"}
                        bg="surface.muted"
                        cursor="grab"
                        _active={{ cursor: "grabbing" }}
                        css={{ aspectRatio: "4 / 3" }}
                      >
                        {photo.src ? (
                          <Image src={photo.src} alt="" draggable={false} objectFit="cover" w="full" h="full" />
                        ) : (
                          <Text fontSize="xs" color="fg.muted" p="2">
                            Not on this device
                          </Text>
                        )}
                        {on && (
                          <Box position="absolute" top="1" left="1" bg="brand.solid" color="white" borderRadius="full" p="0.5">
                            <LuCheck aria-hidden />
                          </Box>
                        )}
                        {usedIds.has(photo.id) && (
                          <Badge position="absolute" bottom="1" right="1" size="xs" variant="solid" colorPalette="gray">
                            In report
                          </Badge>
                        )}
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
