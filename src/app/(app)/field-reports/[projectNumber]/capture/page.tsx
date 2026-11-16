"use client";

import { HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuImages } from "react-icons/lu";

import { CaCaptureBar } from "@/components/ca/CaCaptureBar";
import { CaPhotoGrid } from "@/components/ca/CaPhotoGrid";
import { CaPhotoSheet } from "@/components/ca/CaPhotoSheet";
import { EmptyState } from "@/components/EmptyState";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaPhotos, type CaPhotoView } from "@/hooks/ca/useCaPhotos";

/**
 * Capture tab: take or choose photos, caption them, and see what is synced.
 * Photos are saved on the device the moment they are taken, so this works
 * with no signal. Floor-plan pins join this tab in Phase 3.
 */
export default function CaCapturePage() {
  const { projectNumber } = useCaProject();
  const { photos, loaded, serverReachable, editPhoto } = useCaPhotos(projectNumber);
  const [open, setOpen] = useState<CaPhotoView | null>(null);

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <CaCaptureBar projectNumber={projectNumber} />

      <Stack gap="3">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
            Photos{loaded ? ` (${photos.length})` : ""}
          </Text>
          {!serverReachable && (
            <Text fontSize="sm" color="fg.muted">
              Showing photos on this device
            </Text>
          )}
        </HStack>

        {!loaded ? (
          <HStack gap="3" py="6" justify="center">
            <Spinner size="sm" color="brand.solid" />
            <Text color="fg.muted">Loading photos…</Text>
          </HStack>
        ) : photos.length === 0 ? (
          <EmptyState
            icon={<LuImages />}
            title="No photos yet"
            description="Take or choose photos. They are saved on this device right away and upload when there is a connection."
          />
        ) : (
          <CaPhotoGrid photos={photos} onOpen={setOpen} />
        )}
      </Stack>

      <CaPhotoSheet
        photo={open}
        onClose={() => setOpen(null)}
        onSaveCaption={(id, caption) => editPhoto(id, { caption })}
      />
    </Stack>
  );
}
