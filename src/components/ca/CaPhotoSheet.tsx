"use client";

import {
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Image,
  Portal,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuMapPin } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError } from "@/components/ui/toaster";
import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";

import { SYNC_LOOK } from "./CaPhotoGrid";

/**
 * One photo, full size and uncropped, with its caption. Full-screen on phones.
 * Saving writes to the device first; the caption syncs on its own.
 */
type SheetProps = {
  photo: CaPhotoView | null;
  onClose: () => void;
  onSaveCaption: (id: string, caption: string) => Promise<void>;
  /** Name of the pin the photo is filed under, if any. */
  pinName?: string;
  /** Takes the photo off its pin (it stays in the project). */
  onUnpin?: (id: string) => Promise<void>;
};

export function CaPhotoSheet({ photo, onClose, onSaveCaption, pinName, onUnpin }: SheetProps) {
  return (
    <Dialog.Root
      open={photo !== null}
      onOpenChange={(e) => !e.open && onClose()}
      size={{ base: "full", md: "lg" }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* Keyed by photo, so the caption draft resets for each photo. */}
          {photo && (
            <SheetBody
              key={photo.id}
              photo={photo}
              onClose={onClose}
              onSaveCaption={onSaveCaption}
              pinName={pinName}
              onUnpin={onUnpin}
            />
          )}
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function SheetBody({
  photo,
  onClose,
  onSaveCaption,
  pinName,
  onUnpin,
}: SheetProps & { photo: CaPhotoView }) {
  const [caption, setCaption] = useState(photo.caption);
  const [saving, setSaving] = useState(false);
  const look = SYNC_LOOK[photo.syncState];
  const dirty = caption !== photo.caption;

  async function save() {
    setSaving(true);
    try {
      await onSaveCaption(photo.id, caption.trim());
      onClose();
    } catch (error) {
      notifyError("Could not save the caption", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Photo</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <Stack gap="4">
          <Box bg="gray.900" borderRadius="md" overflow="hidden" display="flex" justifyContent="center">
            {photo.src ? (
              <Image src={photo.src} alt={photo.caption || photo.fileName} maxH="60dvh" objectFit="contain" />
            ) : (
              <Text color="white" p="8">
                This photo is not available offline.
              </Text>
            )}
          </Box>
          <HStack gap="2" fontSize="sm" color="fg.muted" wrap="wrap">
            <Box w="2.5" h="2.5" borderRadius="full" bg={look.bg} flexShrink="0" />
            <Text>{look.label}</Text>
            <Text>·</Text>
            <Text>Taken {new Date(photo.takenAt).toLocaleString()}</Text>
          </HStack>
          {pinName && onUnpin && (
            <HStack justify="space-between" gap="3" borderWidth="1px" borderColor="line" borderRadius="md" px="3" py="2">
              <HStack gap="2" minW="0">
                <LuMapPin aria-hidden />
                <Text truncate>At {pinName}</Text>
              </HStack>
              <Button
                variant="ghost"
                size="md"
                flexShrink="0"
                onClick={() =>
                  onUnpin(photo.id).then(onClose, (error: unknown) => notifyError("Could not remove the photo from the pin", error))
                }
              >
                Remove from pin
              </Button>
            </HStack>
          )}
          {photo.lastError && (
            <Text fontSize="sm" color="fg.error">
              {photo.lastError}
            </Text>
          )}
          <FormField label="Caption" helperText="Shown under the photo in reports. You can change it per report.">
            <Textarea
              size="lg"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Area B columns, gridline 5"
              maxLength={1000}
              autoresize
              rows={2}
            />
          </FormField>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="outline" size="lg" onClick={onClose}>
          {dirty ? "Discard" : "Close"}
        </Button>
        <Button colorPalette="brand" size="lg" loading={saving} disabled={!dirty} onClick={save}>
          Save caption
        </Button>
      </Dialog.Footer>
      <Dialog.CloseTrigger asChild>
        <CloseButton size="lg" />
      </Dialog.CloseTrigger>
    </Dialog.Content>
  );
}
