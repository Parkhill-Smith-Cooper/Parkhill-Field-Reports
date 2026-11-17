"use client";

/**
 * Turns an uploaded or imported drawing file into the sheet IMAGE the app
 * displays and pins against.
 *
 * - PDF: one page is rendered with pdf.js, in the browser, at upload time.
 *   Phones in the field then only ever display an image (fast, low memory,
 *   works offline), and the server needs no PDF tooling.
 * - SVG: rasterized to PNG (an SVG is never stored or served as a drawing).
 * - PNG / JPEG / WebP: kept as-is when within limits, otherwise scaled down.
 *
 * Sheets are capped at a 4096px long edge and 16 megapixels: enough to read
 * room names when zoomed in on a phone, and inside iOS Safari's canvas limit.
 */

const MAX_EDGE = 4096;
const MAX_PIXELS = 16_000_000;
const MAX_KEEP_BYTES = 20 * 1024 * 1024;
const KEEP_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type PreparedSheet = { blob: Blob; width: number; height: number };

export const DRAWING_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/svg+xml";

export function isPdf(file: Blob, fileName: string): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(fileName);
}

function fitScale(width: number, height: number): number {
  return Math.min(MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the sheet image."))), type, quality),
  );
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That drawing image could not be read."));
    };
    image.src = url;
  });
}

/** Prepares an image (PNG, JPEG, WebP or SVG) drawing. */
export async function prepareImageSheet(file: Blob): Promise<PreparedSheet> {
  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("That drawing image has no size.");

  const isSvg = file.type === "image/svg+xml";
  const scale = fitScale(width, height);
  if (!isSvg && KEEP_TYPES.has(file.type) && scale >= 1 && file.size <= MAX_KEEP_BYTES) {
    return { blob: file, width, height };
  }

  // SVGs are vector: draw them as large as the limits allow, for sharp zoom.
  const factor = isSvg ? scale : Math.min(1, scale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * factor);
  canvas.height = Math.round(height * factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare drawings.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9);
  return { blob, width: canvas.width, height: canvas.height };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js is loaded only when a PDF is chosen (it is large). Legacy build for older iOS Safari. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

export type OpenedPdf = {
  pageCount: number;
  /** A small preview of a page, as an object URL (revoke it when done). */
  preview(page: number, longEdge?: number): Promise<string>;
  /** The full sheet image for a page. */
  renderSheet(page: number): Promise<PreparedSheet>;
  close(): Promise<void>;
};

export async function openPdf(file: Blob): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  async function render(pageNumber: number, scaleFor: (w: number, h: number) => number) {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scaleFor(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare drawings.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvas;
  }

  return {
    pageCount: doc.numPages,
    async preview(pageNumber, longEdge = 480) {
      const canvas = await render(pageNumber, (w, h) => longEdge / Math.max(w, h));
      return URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.8));
    },
    async renderSheet(pageNumber) {
      const canvas = await render(pageNumber, fitScale);
      return { blob: await canvasToBlob(canvas, "image/png"), width: canvas.width, height: canvas.height };
    },
    async close() {
      await doc.destroy();
    },
  };
}
