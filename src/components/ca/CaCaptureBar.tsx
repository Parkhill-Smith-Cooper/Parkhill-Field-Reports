"use client";

import { Button, SimpleGrid } from "@chakra-ui/react";
import { useRef, useState, useSyncExternalStore } from "react";
import { LuAperture, LuCamera, LuImages } from "react-icons/lu";

import { notifyError, toaster } from "@/components/ui/toaster";
import { captureFiles } from "@/lib/ca/offline/photoStore";

import { CaRapidCamera } from "./CaRapidCamera";

const noopSubscribe = () => () => {};

/**
 * The three ways to add photos, as large buttons usable with gloves:
 *
 * - **Take photo** opens the phone's own camera (`capture="environment"`):
 *   full resolution, HDR, focus - the camera people already trust.
 * - **Choose photos** opens the library, multi-select, for pictures taken
 *   before the app was opened.
 * - **Rapid capture** keeps a camera open inside the app, so a walk-through
 *   can be shot one tap per photo without leaving and re-entering the app.
 *
 * Every photo is saved on the device immediately and synced later.
 */
export function CaCaptureBar({
  projectNumber,
  pinId,
  onCaptured,
}: {
  projectNumber: string;
  /** Attach new photos to this pin (Phase 3). */
  pinId?: string;
  onCaptured?: (photoIds: string[]) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(0);
  const [rapidOpen, setRapidOpen] = useState(false);

  /**
   * `quiet` skips the "saved" toast: in Rapid capture the camera already shows
   * a running count and the last shot, and on a phone the toast would sit on
   * top of the shutter button.
   */
  async function save(files: File[], { quiet = false } = {}) {
    if (files.length === 0) return [];
    setSaving((n) => n + files.length);
    try {
      const result = await captureFiles(projectNumber, files, { pinId });
      for (const failure of result.failed) {
        notifyError(`Could not save ${failure.name}`, new Error(failure.error));
      }
      if (result.saved.length > 0 && !quiet) {
        toaster.create({
          type: "success",
          title: `${result.saved.length} photo${result.saved.length === 1 ? "" : "s"} saved on this device`,
          duration: 2500,
        });
      }
      if (result.saved.length > 0) onCaptured?.(result.saved);
      return result.saved;
    } finally {
      setSaving((n) => n - files.length);
    }
  }

  function onInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset so choosing the same file again still fires.
    event.target.value = "";
    void save(files);
  }

  // false on the server and during hydration, then the real answer: avoids a
  // hydration mismatch from reading `navigator` while rendering.
  const canRapid = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );

  return (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="ca-camera-input"
        onChange={onInput}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="ca-library-input"
        onChange={onInput}
      />

      <SimpleGrid columns={{ base: canRapid ? 3 : 2 }} gap={{ base: 2, md: 3 }} data-print="hide">
        <Button
          colorPalette="brand"
          size="xl"
          minH="72px"
          flexDirection="column"
          gap="1"
          loading={saving > 0}
          onClick={() => cameraInput.current?.click()}
        >
          <LuCamera />
          Take photo
        </Button>
        <Button
          variant="outline"
          size="xl"
          minH="72px"
          flexDirection="column"
          gap="1"
          borderWidth="2px"
          onClick={() => libraryInput.current?.click()}
        >
          <LuImages />
          Choose photos
        </Button>
        {canRapid && (
          <Button
            variant="outline"
            size="xl"
            minH="72px"
            flexDirection="column"
            gap="1"
            borderWidth="2px"
            onClick={() => setRapidOpen(true)}
          >
            <LuAperture />
            Rapid capture
          </Button>
        )}
      </SimpleGrid>

      {rapidOpen && (
        <CaRapidCamera
          onShot={(file) => save([file], { quiet: true })}
          onClose={() => setRapidOpen(false)}
          onFallback={() => {
            setRapidOpen(false);
            cameraInput.current?.click();
          }}
        />
      )}
    </>
  );
}
