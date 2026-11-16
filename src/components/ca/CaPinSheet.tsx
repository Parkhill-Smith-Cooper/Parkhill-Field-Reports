"use client";

import {
  AspectRatio,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  HStack,
  Image,
  Input,
  Portal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError } from "@/components/ui/toaster";
import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import type { CaPinView } from "@/hooks/ca/useCaPins";

import { CaCaptureBar } from "./CaCaptureBar";
import { CaPhotoGrid } from "./CaPhotoGrid";

/**
 * One pin: its photos, a way to take more straight into it, and its label and
 * note. Full-screen on phones. Everything saves on the device first.
 */
export function CaPinSheet(props: {
  projectNumber: string;
  pin: CaPinView | null;
  number: number;
  /** All project photos; the sheet shows this pin's and offers unpinned ones. */
  photos: CaPhotoView[];
  /** Pin ids that still exist, to tell "unpinned" photos apart. */
  livePinIds: Set<string>;
  onClose: () => void;
  onSave: (patch: { label: string; note: string }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onAttach: (photoIds: string[]) => Promise<unknown>;
  onOpenPhoto: (photo: CaPhotoView) => void;
}) {
  return (
    <Dialog.Root
      open={props.pin !== null}
      onOpenChange={(e) => !e.open && props.onClose()}
      size={{ base: "full", md: "lg" }}
      placement="center"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {props.pin && <PinBody key={props.pin.id} {...props} pin={props.pin} />}
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function PinBody({
  projectNumber,
  pin,
  number,
  photos,
  livePinIds,
  onClose,
  onSave,
  onDelete,
  onAttach,
  onOpenPhoto,
}: Parameters<typeof CaPinSheet>[0] & { pin: CaPinView }) {
  const [label, setLabel] = useState(pin.label);
  const [note, setNote] = useState(pin.note);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const here = photos.filter((p) => p.pinId === pin.id);
  const unpinned = photos.filter((p) => !p.pinId || !livePinIds.has(p.pinId));
  const dirty = label !== pin.label || note !== pin.note;
  const name = pin.label || `Pin ${number}`;

  async function run(action: () => Promise<unknown>, failure: string, close = false) {
    setSaving(true);
    try {
      await action();
      if (close) onClose();
    } catch (error) {
      notifyError(failure, error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Content data-testid="ca-pin-sheet">
      <Dialog.Header>
        <Dialog.Title>{name}</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <Stack gap="5">
          <Stack gap="2">
            <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
              Photos at this pin ({here.length})
            </Text>
            {here.length === 0 ? (
              <Text color="fg.muted">No photos here yet. Take some below.</Text>
            ) : (
              <CaPhotoGrid photos={here} onOpen={onOpenPhoto} />
            )}
          </Stack>

          {/* Rapid capture is left to the Capture tab: its full-screen camera
              cannot sit inside this sheet. */}
          <CaCaptureBar projectNumber={projectNumber} pinId={pin.id} allowRapid={false} />

          {unpinned.length > 0 &&
            (picking ? (
              <Stack gap="3" borderWidth="1px" borderColor="line" borderRadius="md" p="3">
                <Text fontWeight="medium">Choose photos to add to this pin</Text>
                <SimpleGrid columns={{ base: 3, md: 4 }} gap="2">
                  {unpinned.map((photo) => {
                    const checked = chosen.has(photo.id);
                    return (
                      <Checkbox.Root
                        key={photo.id}
                        checked={checked}
                        onCheckedChange={(e) => {
                          const next = new Set(chosen);
                          if (e.checked) next.add(photo.id);
                          else next.delete(photo.id);
                          setChosen(next);
                        }}
                        display="block"
                        position="relative"
                        cursor="pointer"
                        aria-label={photo.caption || photo.fileName}
                      >
                        <Checkbox.HiddenInput />
                        <AspectRatio ratio={1}>
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
                        <Checkbox.Control position="absolute" top="1.5" left="1.5" bg="white" />
                      </Checkbox.Root>
                    );
                  })}
                </SimpleGrid>
                <HStack justify="flex-end">
                  <Button variant="ghost" size="lg" onClick={() => setPicking(false)}>
                    Cancel
                  </Button>
                  <Button
                    colorPalette="brand"
                    size="lg"
                    disabled={chosen.size === 0}
                    loading={saving}
                    onClick={() =>
                      run(async () => {
                        await onAttach([...chosen]);
                        setChosen(new Set());
                        setPicking(false);
                      }, "Could not add the photos")
                    }
                  >
                    Add {chosen.size || ""} photo{chosen.size === 1 ? "" : "s"}
                  </Button>
                </HStack>
              </Stack>
            ) : (
              <Button variant="outline" size="lg" onClick={() => setPicking(true)}>
                <LuImagePlus /> Add photos already taken
              </Button>
            ))}

          <FormField label="Pin label" helperText={`Shown on the drawing and in reports. Leave blank for “Pin ${number}”.`}>
            <Input size="lg" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mech room 110" />
          </FormField>
          <FormField label="Note">
            <Textarea size="lg" value={note} maxLength={2000} autoresize rows={2} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <Box pt="2">
            {confirmDelete ? (
              <Stack gap="2" borderWidth="1px" borderColor="border.error" borderRadius="md" p="3">
                <Text>Delete this pin? Its photos stay in the project, unpinned.</Text>
                <HStack justify="flex-end">
                  <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>
                    Keep pin
                  </Button>
                  <Button colorPalette="red" size="lg" loading={saving} onClick={() => run(onDelete, "Could not delete the pin", true)}>
                    Delete pin
                  </Button>
                </HStack>
              </Stack>
            ) : (
              <Button variant="ghost" colorPalette="red" size="lg" onClick={() => setConfirmDelete(true)}>
                <LuTrash2 /> Delete pin
              </Button>
            )}
          </Box>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="outline" size="lg" onClick={onClose}>
          {dirty ? "Discard" : "Done"}
        </Button>
        <Button
          colorPalette="brand"
          size="lg"
          disabled={!dirty}
          loading={saving}
          onClick={() => run(() => onSave({ label: label.trim(), note }), "Could not save the pin", true)}
        >
          Save pin
        </Button>
      </Dialog.Footer>
      <Dialog.CloseTrigger asChild>
        <CloseButton size="lg" />
      </Dialog.CloseTrigger>
    </Dialog.Content>
  );
}
