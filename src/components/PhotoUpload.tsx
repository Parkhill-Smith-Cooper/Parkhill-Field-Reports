"use client";

import {
  AspectRatio,
  Box,
  Button,
  Image,
  IconButton,
  SimpleGrid,
  Spinner,
  Stack,
} from "@chakra-ui/react";
import { useRef, useState } from "react";
import { LuCamera, LuTrash2 } from "react-icons/lu";

import { notifyError } from "@/components/ui/toaster";
import { usePhotoUrls } from "@/hooks/usePhotoUrls";
import { uploadPhoto } from "@/services/photoService";
import type { ObservationPhoto } from "@/types";

type PhotoUploadProps = {
  projectNumber: string;
  observationId: string;
  photos: ObservationPhoto[];
  onAdded: (photo: ObservationPhoto) => void;
  onRemoved: (photoId: string) => void;
};

/**
 * Field photo capture.
 *
 * A plain file input with `accept="image/*"` and deliberately **no** `capture`
 * attribute: on iOS that means the engineer is offered both "Take Photo" and
 * "Photo Library", which matters because half the time the picture was already
 * taken before the app was opened.
 *
 * Photos are uploaded to Blob Storage the moment they are chosen, rather than
 * held until the report is saved. In the field, a dead battery or a closed tab
 * is a real risk, and losing pictures is worse than leaving an unreferenced
 * blob behind if the observation is later abandoned.
 *
 * Each file is downscaled and re-encoded in the browser first - see
 * `src/lib/downscaleImage.ts` for why that is the difference between a usable
 * and an unusable upload on site.
 */
export function PhotoUpload({
  projectNumber,
  observationId,
  photos,
  onAdded,
  onRemoved,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    setUploading((count) => count + selected.length);

    // Sequential rather than parallel: field connections are narrow, and
    // several large uploads at once make all of them slower and more likely to
    // time out. One failure also must not abandon the rest of the batch.
    for (const file of selected) {
      try {
        const photo = await uploadPhoto(projectNumber, observationId, file);
        onAdded(photo);
      } catch (error) {
        notifyError(`Could not upload ${file.name}`, error);
      } finally {
        setUploading((count) => count - 1);
      }
    }

    // Reset the input so choosing the same file again still fires a change.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    // width="full" is load-bearing. FormField renders Chakra's Field.Root, a
    // column aligned to flex-start, so children shrink to their content. A
    // thumbnail has no intrinsic width - its height is derived from its width
    // by the aspect ratio - so without this the grid collapses to nothing and
    // only the fixed-size delete buttons remain visible.
    <Stack gap="3" width="full">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <Button
        variant="outline"
        size={{ base: "lg", md: "md" }}
        width={{ base: "full", sm: "auto" }}
        alignSelf="flex-start"
        onClick={() => inputRef.current?.click()}
        loading={uploading > 0}
        loadingText={`Uploading ${uploading} photo${uploading === 1 ? "" : "s"}`}
      >
        <LuCamera />
        Add photo
      </Button>

      {photos.length > 0 && (
        <PhotoThumbnails
          projectNumber={projectNumber}
          photos={photos}
          onRemoved={onRemoved}
        />
      )}
    </Stack>
  );
}

function PhotoThumbnails({
  projectNumber,
  photos,
  onRemoved,
}: {
  projectNumber: string;
  photos: ObservationPhoto[];
  onRemoved: (photoId: string) => void;
}) {
  const urls = usePhotoUrls(
    projectNumber,
    photos.map((photo) => photo.blobPath),
  );

  return (
    <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap="3" width="full">
      {photos.map((photo) => (
        <Box key={photo.id} position="relative" minW="0">
          <AspectRatio ratio={4 / 3}>
            <Box
              borderWidth="1px"
              borderColor="line"
              borderRadius="md"
              overflow="hidden"
              bg="surface.muted"
            >
              {urls[photo.blobPath] ? (
                <Image
                  src={urls[photo.blobPath]}
                  alt={photo.fileName}
                  objectFit="cover"
                  width="full"
                  height="full"
                />
              ) : (
                <Spinner size="sm" color="brand.solid" />
              )}
            </Box>
          </AspectRatio>

          {/* A light chip rather than a solid dark square: it has to read over
              any photo without dominating it, and "sm" rather than "xs" keeps
              it a usable touch target on a phone. */}
          <IconButton
            aria-label={`Remove ${photo.fileName}`}
            size="sm"
            variant="solid"
            position="absolute"
            top="2"
            right="2"
            bg="white/90"
            color="fg"
            borderWidth="1px"
            borderColor="line"
            borderRadius="full"
            boxShadow="sm"
            _hover={{ bg: "white", color: "brand.fg" }}
            onClick={() => onRemoved(photo.id)}
          >
            <LuTrash2 />
          </IconButton>
        </Box>
      ))}
    </SimpleGrid>
  );
}
