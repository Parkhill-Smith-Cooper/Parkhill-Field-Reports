"use client";

import { Badge, Box, Button, HStack, NativeSelect, Spinner, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuLocateFixed, LuMap, LuRoute } from "react-icons/lu";

import { CaDrawingPicker } from "@/components/ca/CaDrawingPicker";
import { CaDrawingViewer } from "@/components/ca/CaDrawingViewer";
import { CaStateLink } from "@/components/ca/CaStateLink";
import { EmptyState } from "@/components/EmptyState";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaDrawings } from "@/hooks/ca/useCaDrawings";
import { useCaPhotos } from "@/hooks/ca/useCaPhotos";
import { useCaPins } from "@/hooks/ca/useCaPins";
import { numberPins, pinName } from "@/lib/ca/pins";
import { photosOfReport } from "@/lib/ca/reportPhotos";
import { caReportPath } from "@/lib/ca/routes";
import { buildSiteRoute, routeDays } from "@/lib/ca/siteRoute";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * A report's Site Route step: the order the engineer moved through the site,
 * reconstructed from the pins they dropped and the times of the photos taken
 * at each one for this report.
 * Numbers are steps along the route; the dashed line joins them in order and
 * says nothing about the path walked in between.
 *
 * "Start Tracking" is a deliberate placeholder: no live location tracking is
 * built. Indoor positioning from a web app is not reliable enough to promise
 * (see docs/ca-positioning-research.md).
 */
export function CaReportRouteStep({ reportId }: { reportId: string }) {
  const { projectNumber } = useCaProject();
  const { drawings, loaded } = useCaDrawings(projectNumber);
  const { pins } = useCaPins(projectNumber);
  const { photos: allPhotos } = useCaPhotos(projectNumber);
  const photos = photosOfReport(allPhotos, reportId);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [day, setDay] = useState<string>("");

  const drawing =
    drawings.find((d) => d.id === drawingId) ?? drawings.find((d) => d.isCurrent) ?? drawings[0] ?? null;
  const days = drawing ? routeDays(pins, photos, drawing.id) : [];
  const selectedDay = days.includes(day) ? day : "";
  const route = drawing
    ? buildSiteRoute({ pins, photos, drawingId: drawing.id, day: selectedDay || null })
    : { stops: [], pinsWithoutPhotos: 0 };
  const numbers = numberPins(pins);
  const pinsById = new Map(pins.map((p) => [p.id, p]));

  if (!loaded) {
    return (
      <HStack gap="3" py="8" justify="center">
        <Spinner size="sm" color="brand.solid" />
        <Text color="fg.muted">Loading…</Text>
      </HStack>
    );
  }

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <TrackingPlaceholder />

      {!drawing ? (
        <EmptyState
          icon={<LuMap />}
          title="No floor plans yet"
          description="Add a drawing and drop pins in the Capture step. The route appears here as photos are taken at each pin."
          action={
            <Button asChild colorPalette="brand" size="lg">
              <CaStateLink href={caReportPath(projectNumber, reportId, "capture")}>Go to Capture</CaStateLink>
            </Button>
          }
        />
      ) : (
        <Stack gap="3">
          <Stack direction={{ base: "column", md: "row" }} gap="3" align={{ md: "flex-start" }}>
            <Box flex="2" minW="0">
              <CaDrawingPicker drawings={drawings} value={drawing} onChange={setDrawingId} />
            </Box>
            <NativeSelect.Root size="lg" flex="1">
              <NativeSelect.Field
                aria-label="Date"
                value={selectedDay}
                onChange={(e) => setDay(e.currentTarget.value)}
                data-testid="ca-route-day"
              >
                <option value="">All dates</option>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Stack>

          <CaDrawingViewer
            key={drawing.id}
            src={drawing.src}
            width={drawing.width}
            height={drawing.height}
            title={`Site route on ${drawing.sheetNumber ?? ""} ${drawing.title}`.trim()}
            route={route.stops}
            pins={route.stops.map((s) => ({
              id: s.pinId,
              x: s.x,
              y: s.y,
              marker: String(s.step),
              name: `Stop ${s.step}: ${pinName(s, numbers.get(s.pinId))}`,
            }))}
          />

          <Text fontSize="sm" color="fg.muted">
            Reconstructed from photo times at each pin — not GPS. The dashed line shows the order of stops, not the
            path walked.
          </Text>

          {route.stops.length === 0 ? (
            <EmptyState
              icon={<LuRoute />}
              title="No route yet"
              description="Take photos at pins on this drawing in the Capture step. Each pin becomes a stop, in the order its first photo was taken."
            />
          ) : (
            <Stack as="ol" gap="2" data-testid="ca-route-stops" listStyleType="none">
              {route.stops.map((s) => {
                const pin = pinsById.get(s.pinId);
                return (
                  <HStack as="li" key={s.pinId} gap="3" borderWidth="1px" borderColor="line" borderRadius="md" p="3" align="flex-start">
                    <Box
                      flexShrink="0"
                      w="9"
                      h="9"
                      borderRadius="full"
                      bg="brand.solid"
                      color="white"
                      fontWeight="bold"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      {s.step}
                    </Box>
                    <Box minW="0">
                      <Text fontWeight="medium">{pinName(s, numbers.get(s.pinId))}</Text>
                      <Text fontSize="sm" color="fg.muted">
                        {selectedDay ? "" : `${new Date(s.firstAt).toLocaleDateString()} · `}
                        {time(s.firstAt)}
                        {s.lastAt !== s.firstAt ? `–${time(s.lastAt)}` : ""} · {s.photoCount} photo
                        {s.photoCount === 1 ? "" : "s"}
                      </Text>
                      {pin?.note && (
                        <Text fontSize="sm" mt="1" lineClamp={2}>
                          {pin.note}
                        </Text>
                      )}
                    </Box>
                  </HStack>
                );
              })}
            </Stack>
          )}
          {route.pinsWithoutPhotos > 0 && (
            <Text fontSize="sm" color="fg.muted">
              {route.pinsWithoutPhotos} pin{route.pinsWithoutPhotos === 1 ? " has" : "s have"} no photos in this report, so{" "}
              {route.pinsWithoutPhotos === 1 ? "it is" : "they are"} not on the route.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** Clearly labelled stub. No location is read, stored or sent. */
function TrackingPlaceholder() {
  return (
    <Stack
      gap="3"
      borderWidth="1px"
      borderColor="line"
      borderRadius="lg"
      p={{ base: 4, md: 5 }}
      bg="surface.muted"
      data-testid="ca-tracking-placeholder"
    >
      <HStack gap="3" wrap="wrap">
        <Button size="xl" minH="64px" disabled aria-describedby="ca-tracking-note">
          <LuLocateFixed /> Start Tracking
        </Button>
        <Badge colorPalette="gray" variant="solid" size="lg">
          Coming soon — not available yet
        </Badge>
      </HStack>
      <Text id="ca-tracking-note" fontSize="sm" color="fg.muted">
        Live tracking is not built. GPS is not reliable indoors, and a web app cannot track with the screen off, so
        the options are still being evaluated. For now the route below is rebuilt from your pins and photo times.
      </Text>
    </Stack>
  );
}
