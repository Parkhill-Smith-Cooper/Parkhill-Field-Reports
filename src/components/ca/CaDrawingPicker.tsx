"use client";

import { Box, Button, HStack, IconButton, Menu, NativeSelect, Portal, Text } from "@chakra-ui/react";
import { LuCloudOff, LuEllipsisVertical, LuPlus } from "react-icons/lu";

import type { CaDrawingView } from "@/hooks/ca/useCaDrawings";

import { CaSourceTag } from "./CaSourceTag";

export const drawingLabel = (d: Pick<CaDrawingView, "sheetNumber" | "title">) =>
  [d.sheetNumber, d.title].filter(Boolean).join(" · ");

/**
 * Chooses which sheet is shown. Superseded sheets stay selectable (their pins
 * still matter) but are listed separately. Optional actions: add a drawing,
 * and mark the shown sheet superseded / current.
 */
export function CaDrawingPicker({
  drawings,
  value,
  onChange,
  onAdd,
  onSetCurrent,
}: {
  drawings: CaDrawingView[];
  value: CaDrawingView | null;
  onChange: (id: string) => void;
  onAdd?: () => void;
  onSetCurrent?: (drawing: CaDrawingView, isCurrent: boolean) => void;
}) {
  const current = drawings.filter((d) => d.isCurrent);
  const superseded = drawings.filter((d) => !d.isCurrent);

  return (
    <Box>
      <HStack gap="2" align="stretch">
        <NativeSelect.Root size="lg" flex="1" minW="0">
          <NativeSelect.Field
            aria-label="Drawing"
            value={value?.id ?? ""}
            onChange={(e) => onChange(e.currentTarget.value)}
            data-testid="ca-drawing-select"
          >
            {current.map((d) => (
              <option key={d.id} value={d.id}>
                {drawingLabel(d)}
              </option>
            ))}
            {superseded.length > 0 && (
              <optgroup label="Superseded">
                {superseded.map((d) => (
                  <option key={d.id} value={d.id}>
                    {drawingLabel(d)} (superseded)
                  </option>
                ))}
              </optgroup>
            )}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>

        {onSetCurrent && value && (
          <Menu.Root>
            <Menu.Trigger asChild>
              <IconButton aria-label="Drawing options" variant="outline" size="lg">
                <LuEllipsisVertical />
              </IconButton>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content>
                  <Menu.Item value="current" onClick={() => onSetCurrent(value, !value.isCurrent)}>
                    {value.isCurrent ? "Mark as superseded" : "Mark as current"}
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        )}

        {onAdd && (
          <Button variant="outline" size="lg" onClick={onAdd} flexShrink="0" aria-label="Add drawing">
            <LuPlus />
            <Box as="span" display={{ base: "none", sm: "inline" }}>
              Add drawing
            </Box>
          </Button>
        )}
      </HStack>

      {value && (
        <HStack gap="2" mt="2" fontSize="sm" color="fg.muted" wrap="wrap">
          {value.source === "mock" ? <CaSourceTag source="mock" /> : <CaSourceTag source={value.source === "ca-app" ? "ca-app" : "upload"} />}
          {value.revisionLabel && <Text>{value.revisionLabel}</Text>}
          {value.fileType === "pdf" && <Text>PDF page {value.page} of {value.pageCount}</Text>}
          {!value.offlineReady && (
            <HStack gap="1" color="fg.warning">
              <LuCloudOff aria-hidden />
              <Text>Not saved for offline yet</Text>
            </HStack>
          )}
        </HStack>
      )}
    </Box>
  );
}
