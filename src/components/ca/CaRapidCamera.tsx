"use client";

import { Box, Button, HStack, Image, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuCamera, LuCheck, LuX } from "react-icons/lu";

/**
 * In-app camera for shooting many photos in a row: one large shutter, a
 * running count and the last shot, and "Done". Each shot is handed to
 * `onShot` immediately (and saved on the device), so closing the app
 * mid-walk loses nothing.
 *
 * Uses `getUserMedia`. If the camera is unavailable or permission is denied,
 * it offers the phone's own camera instead.
 */
export function CaRapidCamera({
  onShot,
  onClose,
  onFallback,
}: {
  onShot: (file: File) => Promise<unknown>;
  onClose: () => void;
  onFallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("The camera could not be opened here. Use the phone camera instead.");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => {
    if (last) URL.revokeObjectURL(last);
  }, [last]);

  async function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    const stamp = new Date();
    const file = new File([blob], `Photo ${stamp.toISOString().slice(0, 19).replace("T", " ")}.jpg`, {
      type: "image/jpeg",
      lastModified: stamp.getTime(),
    });
    setLast(URL.createObjectURL(blob));
    setCount((n) => n + 1);
    await onShot(file);
  }

  return (
    <Box
      position="fixed"
      inset="0"
      zIndex="modal"
      bg="black"
      color="white"
      display="flex"
      flexDirection="column"
      role="dialog"
      aria-label="Rapid capture camera"
    >
      <HStack justify="space-between" px="4" py="3">
        <Button variant="ghost" color="white" size="lg" onClick={onClose} aria-label="Close camera">
          <LuX />
        </Button>
        <Text fontWeight="bold" data-testid="ca-rapid-count">
          {count} photo{count === 1 ? "" : "s"}
        </Text>
        <Button colorPalette="green" size="lg" onClick={onClose}>
          <LuCheck />
          Done
        </Button>
      </HStack>

      <Box flex="1" position="relative" overflow="hidden">
        <video
          ref={video}
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {flash && <Box position="absolute" inset="0" bg="white" opacity={0.6} />}
        {error && (
          <Stack position="absolute" inset="0" align="center" justify="center" gap="4" px="6" textAlign="center">
            <Text fontSize="lg">{error}</Text>
            <Button colorPalette="brand" size="xl" onClick={onFallback}>
              <LuCamera />
              Use phone camera
            </Button>
          </Stack>
        )}
      </Box>

      <HStack justify="space-between" align="center" px="6" py="6" pb="max(24px, env(safe-area-inset-bottom))">
        <Box boxSize="64px" borderRadius="md" overflow="hidden" bg="whiteAlpha.200">
          {last && <Image src={last} alt="Last photo" boxSize="64px" objectFit="cover" />}
        </Box>
        <Button
          aria-label="Take photo"
          data-testid="ca-rapid-shutter"
          disabled={!ready}
          onClick={() => void shoot()}
          boxSize="84px"
          borderRadius="full"
          bg="white"
          borderWidth="6px"
          borderColor="whiteAlpha.500"
          _hover={{ bg: "gray.100" }}
          _active={{ transform: "scale(0.94)" }}
        />
        <Box boxSize="64px" />
      </HStack>
    </Box>
  );
}
