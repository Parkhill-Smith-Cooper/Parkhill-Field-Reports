"use client";

/**
 * Downscale and re-encode a photo in the browser before it is uploaded.
 *
 * This is the highest-value optimisation in the app. A photo straight off a
 * modern phone is 3-5 MB; at a 1600px long edge and JPEG quality 0.8 the same
 * image is typically 200-400 KB. That is the difference between a usable and
 * an unusable upload on field LTE, and it keeps the report fast to render.
 *
 * Re-encoding to JPEG also normalises formats the browser can decode but other
 * tools may not - notably HEIC from iPhones, which Safari will decode here and
 * hand back as JPEG.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

export type DownscaledImage = {
  blob: Blob;
  width: number;
  height: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}. Is it a supported image?`));
    };
    image.src = url;
  });
}

function scaledSize(width: number, height: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_EDGE) {
    return { width, height };
  }
  const ratio = MAX_EDGE / longEdge;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export async function downscaleImage(file: File): Promise<DownscaledImage> {
  const image = await loadImage(file);
  const target = scaledSize(image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not process the image.");
  }
  context.drawImage(image, 0, 0, target.width, target.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) {
    throw new Error(`Could not compress ${file.name}.`);
  }

  return { blob, width: target.width, height: target.height };
}
