"use client";

import { Box, IconButton, Stack, Text } from "@chakra-ui/react";
import { useRef } from "react";
import { LuMinus, LuPlus, LuScan } from "react-icons/lu";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const MAX_VIEWER_HEIGHT = "min(68dvh, 720px)";

export type ViewerPin = {
  id: string;
  x: number;
  y: number;
  /** Text inside the marker, e.g. the pin or route step number. */
  marker: string;
  /** Accessible name, e.g. "Pin 3, Mech room, 2 photos". */
  name: string;
  pending?: boolean;
};

/**
 * A drawing sheet with pinch / pan / zoom and pins on top.
 *
 * - Pins are positioned as fractions of the sheet, so they stay on the same
 *   spot at any zoom; markers are counter-scaled to keep a constant, easy to
 *   hit size (48px) instead of growing with the drawing.
 * - In drop mode, panning is switched off and one tap places a pin (pinch to
 *   zoom still works), so a pan can never be mistaken for a drop.
 * - `route` draws a dashed line through the given points, in order.
 */
export function CaDrawingViewer({
  src,
  width,
  height,
  title,
  pins,
  selectedPinId,
  dropMode = false,
  onDrop,
  onPinTap,
  route,
}: {
  src: string | null;
  width: number;
  height: number;
  title: string;
  pins: ViewerPin[];
  selectedPinId?: string | null;
  dropMode?: boolean;
  onDrop?: (x: number, y: number) => void;
  onPinTap?: (pinId: string) => void;
  route?: { x: number; y: number }[];
}) {
  const content = useRef<HTMLDivElement>(null);

  function onSheetClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!dropMode || !onDrop) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onDrop((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }

  return (
    <Box
      position="relative"
      borderWidth="1px"
      borderColor={dropMode ? "brand.solid" : "line"}
      outline={dropMode ? "2px solid" : undefined}
      outlineColor="brand.solid"
      borderRadius="md"
      overflow="hidden"
      bg="gray.100"
      data-testid="ca-drawing-viewer"
      data-drop-mode={dropMode ? "on" : "off"}
    >
      <TransformWrapper
        minScale={1}
        maxScale={12}
        doubleClick={{ disabled: true }}
        panning={{ disabled: dropMode, velocityDisabled: true }}
        wheel={{ step: 0.15 }}
        onTransformed={(_ref, state) => {
          content.current?.style.setProperty("--ca-pin-scale", String(1 / state.scale));
        }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              // The viewer takes the sheet's shape, capped in height, and the
              // whole sheet fits on first view (nothing hidden until panned).
              wrapperStyle={{
                width: "100%",
                aspectRatio: `${width} / ${height}`,
                maxHeight: MAX_VIEWER_HEIGHT,
                justifyContent: "center",
                alignItems: "center",
              }}
              contentStyle={{ width: `min(100%, calc(${MAX_VIEWER_HEIGHT} * ${width / height}))` }}
            >
              <Box
                ref={content}
                position="relative"
                width="100%"
                style={{ aspectRatio: `${width} / ${height}` }}
                cursor={dropMode ? "crosshair" : "grab"}
                onClick={onSheetClick}
                data-testid="ca-drawing-sheet"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob/SAS URLs; next/image adds nothing here
                  <img
                    src={src}
                    alt={title}
                    draggable={false}
                    style={{ width: "100%", height: "100%", display: "block", userSelect: "none", background: "#fff" }}
                  />
                ) : (
                  <Stack h="full" align="center" justify="center" bg="white" p="6">
                    <Text color="fg.muted" textAlign="center">
                      This drawing is not available offline yet. Open it once with a connection.
                    </Text>
                  </Stack>
                )}

                {route && route.length > 1 && (
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    aria-hidden
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                  >
                    <polyline
                      points={route.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#C8102E"
                      strokeWidth={3}
                      strokeDasharray="8 6"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      data-testid="ca-route-line"
                    />
                  </svg>
                )}

                {pins.map((pin) => (
                  <PinMarker
                    key={pin.id}
                    pin={pin}
                    selected={pin.id === selectedPinId}
                    onTap={onPinTap}
                    inert={dropMode}
                  />
                ))}
              </Box>
            </TransformComponent>

            <Stack position="absolute" right="2" top="2" gap="2" data-print="hide">
              <IconButton aria-label="Zoom in" size="lg" variant="surface" onClick={() => zoomIn()}>
                <LuPlus />
              </IconButton>
              <IconButton aria-label="Zoom out" size="lg" variant="surface" onClick={() => zoomOut()}>
                <LuMinus />
              </IconButton>
              <IconButton aria-label="Fit drawing" size="lg" variant="surface" onClick={() => resetTransform()}>
                <LuScan />
              </IconButton>
            </Stack>
          </>
        )}
      </TransformWrapper>
    </Box>
  );
}

function PinMarker({
  pin,
  selected,
  onTap,
  inert,
}: {
  pin: ViewerPin;
  selected: boolean;
  onTap?: (pinId: string) => void;
  inert: boolean;
}) {
  return (
    <Box
      as="button"
      position="absolute"
      left={`${pin.x * 100}%`}
      top={`${pin.y * 100}%`}
      w="48px"
      // 41px tall: the rotated 32px teardrop's tip lands exactly on the bottom
      // edge, which is anchored on the spot (translate -100%) at a constant
      // on-screen size.
      h="41px"
      transform="translate(-50%, -100%) scale(var(--ca-pin-scale, 1))"
      transformOrigin="50% 100%"
      display="flex"
      alignItems="flex-start"
      justifyContent="center"
      pointerEvents={inert || !onTap ? "none" : "auto"}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onTap?.(pin.id);
      }}
      aria-label={pin.name}
      data-testid="ca-pin"
      data-pin-id={pin.id}
      data-sync={pin.pending ? "pending" : "synced"}
      _focusVisible={{ outline: "3px solid", outlineColor: "brand.focusRing" }}
    >
      <Box
        w="32px"
        h="32px"
        mt="2px"
        borderRadius="50% 50% 50% 0"
        transform="rotate(-45deg)"
        bg={selected ? "gray.900" : "brand.solid"}
        borderWidth="3px"
        borderColor={pin.pending ? "orange.300" : "white"}
        boxShadow="0 2px 6px rgba(0,0,0,0.45)"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text
          as="span"
          transform="rotate(45deg)"
          color="white"
          fontWeight="bold"
          fontSize={pin.marker.length > 2 ? "xs" : "sm"}
          lineHeight="1"
        >
          {pin.marker}
        </Text>
      </Box>
    </Box>
  );
}
