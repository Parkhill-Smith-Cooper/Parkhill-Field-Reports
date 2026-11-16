"use client";

import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  Image,
  Portal,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuMapPin } from "react-icons/lu";

import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";

/**
 * Picks project photos: several for an observation item, or one for the
 * project photo. Photos already in the item are shown as chosen and can be
 * left as they are. Newest first, with the pin each photo was taken at.
 */
export function CaPhotoPicker({
  open,
  title,
  photos,
  pinNames,
  single = false,
  exclude = [],
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  photos: CaPhotoView[];
  pinNames: Map<string, string>;
  single?: boolean;
  /** Photo ids already used here; not offered again. */
  exclude?: string[];
  onClose: () => void;
  onPick: (photoIds: string[]) => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      size={{ base: "full", md: "xl" }}
      placement="center"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {open && (
            <PickerBody
              title={title}
              photos={photos.filter((p) => !exclude.includes(p.id))}
              pinNames={pinNames}
              single={single}
              onClose={onClose}
              onPick={onPick}
            />
          )}
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function PickerBody({
  title,
  photos,
  pinNames,
  single,
  onClose,
  onPick,
}: {
  title: string;
  photos: CaPhotoView[];
  pinNames: Map<string, string>;
  single: boolean;
  onClose: () => void;
  onPick: (photoIds: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);

  function toggle(id: string, on: boolean) {
    if (single) setChosen(on ? [id] : []);
    else setChosen((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  }

  return (
    <Dialog.Content data-testid="ca-photo-picker">
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        {photos.length === 0 ? (
          <Text color="fg.muted">No other photos in this project yet. Take some on the Capture tab.</Text>
        ) : (
          <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap="2">
            {photos.map((photo) => {
              const checked = chosen.includes(photo.id);
              const pin = photo.pinId ? pinNames.get(photo.pinId) : undefined;
              return (
                <Checkbox.Root
                  key={photo.id}
                  checked={checked}
                  onCheckedChange={(e) => toggle(photo.id, Boolean(e.checked))}
                  display="block"
                  position="relative"
                  cursor="pointer"
                  aria-label={photo.caption || photo.fileName}
                  data-testid="ca-picker-photo"
                >
                  <Checkbox.HiddenInput />
                  <AspectRatio ratio={4 / 3}>
                    <Box
                      borderRadius="md"
                      overflow="hidden"
                      borderWidth="3px"
                      borderColor={checked ? "brand.solid" : "transparent"}
                      bg="surface.muted"
                    >
                      {photo.src && <Image src={photo.src} alt="" objectFit="cover" w="full" h="full" />}
                    </Box>
                  </AspectRatio>
                  <Checkbox.Control position="absolute" top="2" left="2" bg="white" />
                  <Stack gap="0.5" mt="1">
                    {pin && (
                      <Badge size="sm" variant="subtle" alignSelf="flex-start" gap="1">
                        <LuMapPin aria-hidden /> {pin}
                      </Badge>
                    )}
                    <Text fontSize="xs" color="fg.muted" lineClamp={2}>
                      {photo.caption || new Date(photo.takenAt).toLocaleString()}
                    </Text>
                  </Stack>
                </Checkbox.Root>
              );
            })}
          </SimpleGrid>
        )}
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="outline" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button
          colorPalette="brand"
          size="lg"
          disabled={chosen.length === 0}
          onClick={() => {
            onPick(chosen);
            onClose();
          }}
        >
          {single ? "Use photo" : `Add ${chosen.length || ""} photo${chosen.length === 1 ? "" : "s"}`}
        </Button>
      </Dialog.Footer>
      <Dialog.CloseTrigger asChild>
        <CloseButton size="lg" />
      </Dialog.CloseTrigger>
    </Dialog.Content>
  );
}
