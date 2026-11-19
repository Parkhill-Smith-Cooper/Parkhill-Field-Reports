import type { CaItemPhoto, CaReportContent, CaReportLocation } from "@/types/ca";

import { numberPins, pinName } from "./pins";

/**
 * The report's "Photo Locations" pages. Pure, so the browser (draft preview
 * and editor) and the server (freezing a revision) build them the same way.
 */

type LocPhoto = { id: string; caption: string; pinId?: string; deleted?: boolean };
type LocPin = { id: string; drawingId: string; createdAt: string; label: string; x: number; y: number; deleted?: boolean };
type LocDrawing = { id: string; title: string; sheetNumber?: string; filePath: string; width: number; height: number };

/**
 * One section per pin that the report's observation-item photos were taken
 * at, in the order the pins first appear in the report. A photo shows once,
 * with its caption from the report (or the photo's own caption when the
 * report's is blank). Photos with no pin, a deleted pin, or that are not
 * known yet are left out: they have no location to show.
 */
export function buildReportLocations(input: {
  content: Pick<CaReportContent, "items">;
  photos: LocPhoto[];
  pins: LocPin[];
  drawings: LocDrawing[];
}): CaReportLocation[] {
  const photos = new Map(input.photos.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const livePins = input.pins.filter((p) => !p.deleted);
  const pins = new Map(livePins.map((p) => [p.id, p]));
  const numbers = numberPins(livePins);
  const drawings = new Map(input.drawings.map((d) => [d.id, d]));

  const sections = new Map<string, CaItemPhoto[]>();
  const seen = new Set<string>();
  for (const item of input.content.items) {
    for (const used of item.photos) {
      if (seen.has(used.photoId)) continue;
      const photo = photos.get(used.photoId);
      if (!photo?.pinId || !pins.has(photo.pinId)) continue;
      seen.add(used.photoId);
      const list = sections.get(photo.pinId) ?? [];
      list.push({ photoId: used.photoId, caption: used.caption.trim() ? used.caption : photo.caption });
      sections.set(photo.pinId, list);
    }
  }

  return [...sections].map(([pinId, list]) => {
    const pin = pins.get(pinId)!;
    const drawing = drawings.get(pin.drawingId);
    return {
      pinId,
      title: pinName(pin, numbers.get(pinId)),
      subtitle: drawing ? [drawing.sheetNumber, drawing.title].filter(Boolean).join(" · ") : "",
      drawing: drawing
        ? { id: drawing.id, filePath: drawing.filePath, width: drawing.width, height: drawing.height }
        : null,
      x: pin.x,
      y: pin.y,
      photos: list,
    };
  });
}

// ---------------------------------------------------------------------------
// Floor-plan inset
// ---------------------------------------------------------------------------

/** The inset's size on the page, in CSS px (96 per inch): 2.4in × 1.7in. */
export const INSET_WIDTH = 230;
export const INSET_HEIGHT = 163;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

/**
 * Where to draw the sheet image inside the inset for a zoom level.
 *
 * Zoom 1 fits the whole sheet in the box. Zooming in scales around the pin,
 * which is kept centred unless that would show past the sheet's edge; then
 * the sheet stops at the edge and the pin moves off-centre instead.
 *
 * Returns the image's offset and size, and the pin's position, in px within
 * the box.
 */
export function insetView(input: {
  sheetWidth: number;
  sheetHeight: number;
  x: number;
  y: number;
  zoom: number;
  boxWidth?: number;
  boxHeight?: number;
}) {
  const bw = input.boxWidth ?? INSET_WIDTH;
  const bh = input.boxHeight ?? INSET_HEIGHT;
  const fit = Math.min(bw / input.sheetWidth, bh / input.sheetHeight);
  const scale = fit * clampZoom(input.zoom);
  const width = input.sheetWidth * scale;
  const height = input.sheetHeight * scale;

  const axis = (size: number, box: number, at: number) => {
    if (size <= box) return (box - size) / 2;
    const centred = box / 2 - at * size;
    return Math.min(0, Math.max(box - size, centred));
  };
  const left = axis(width, bw, input.x);
  const top = axis(height, bh, input.y);
  return { left, top, width, height, pinLeft: left + input.x * width, pinTop: top + input.y * height };
}
