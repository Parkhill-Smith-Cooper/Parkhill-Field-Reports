"use client";

import { AspectRatio, Badge, Box, Image, SimpleGrid, Text } from "@chakra-ui/react";
import { LuCircleCheck, LuClock, LuImageOff, LuTriangleAlert } from "react-icons/lu";

import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import type { SyncState } from "@/lib/ca/offline/db";

const SYNC_LOOK: Record<SyncState, { label: string; icon: React.ReactNode; bg: string }> = {
  synced: { label: "Synced", icon: <LuCircleCheck />, bg: "green.700" },
  pending: { label: "On this device — waiting to upload", icon: <LuClock />, bg: "orange.500" },
  error: { label: "Upload failed", icon: <LuTriangleAlert />, bg: "red.700" },
};

/**
 * Photo thumbnails with a sync badge on each, and the caption beneath.
 * Thumbnails crop to a tidy grid; the full photo is never cropped in the
 * photo sheet or the printed report.
 */
export function CaPhotoGrid({
  photos,
  onOpen,
}: {
  photos: CaPhotoView[];
  onOpen: (photo: CaPhotoView) => void;
}) {
  return (
    <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap={{ base: 2, md: 3 }} data-testid="ca-photo-grid">
      {photos.map((photo) => {
        const look = SYNC_LOOK[photo.syncState];
        return (
          <Box
            key={photo.id}
            as="button"
            textAlign="left"
            onClick={() => onOpen(photo)}
            data-testid="ca-photo-tile"
            data-sync={photo.syncState}
            aria-label={`Photo ${photo.caption || photo.fileName}. ${look.label}.`}
            borderRadius="md"
            _focusVisible={{ outline: "3px solid", outlineColor: "brand.focusRing", outlineOffset: "2px" }}
          >
            <AspectRatio ratio={4 / 3}>
              <Box position="relative" borderRadius="md" overflow="hidden" bg="surface.muted" borderWidth="1px" borderColor="line">
                {photo.src ? (
                  <Image src={photo.src} alt="" objectFit="cover" width="full" height="full" loading="lazy" />
                ) : (
                  <Box color="fg.subtle" fontSize="2xl" aria-hidden>
                    <LuImageOff />
                  </Box>
                )}
                <Badge
                  position="absolute"
                  top="1.5"
                  right="1.5"
                  bg={look.bg}
                  color="white"
                  borderRadius="full"
                  px="1.5"
                  py="1"
                  title={look.label}
                  aria-hidden
                >
                  {look.icon}
                </Badge>
              </Box>
            </AspectRatio>
            <Text fontSize="sm" mt="1" lineClamp={2} color={photo.caption ? "fg" : "fg.subtle"}>
              {photo.caption || "Add a caption"}
            </Text>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}

export { SYNC_LOOK };
