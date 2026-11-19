/**
 * Groups a project's photos by the pin (photo location) they were taken at,
 * for the report editor's photo panel.
 *
 * Groups follow the drawings' order and, within a drawing, the pins' numbers
 * (the order they were dropped). Photos with no pin, or whose pin was
 * deleted, come last under "No pinned location". Within a group, photos keep
 * the order they were given in (newest first from `useCaPhotos`).
 */

type GroupablePhoto = { id: string; pinId?: string; takenAt: string };
type GroupablePin = { id: string; drawingId: string; label: string };
type GroupableDrawing = { id: string; title: string; sheetNumber?: string };

export type CaPhotoGroup<P> = {
  /** The pin id, or `"none"` for photos without a pin. */
  key: string;
  /** "Pin 3", or the pin's label. */
  title: string;
  /** The drawing the pin is on, e.g. "A-101 · First Floor Plan". */
  subtitle?: string;
  photos: P[];
};

export const NO_PIN_GROUP = "none";

export function groupPhotosByPin<P extends GroupablePhoto>(input: {
  photos: P[];
  pins: GroupablePin[];
  /** Pin numbers per drawing, from `numberPins`. */
  pinNumbers: Map<string, number>;
  /** Display names for pins ("Pin 3" when unlabelled). */
  pinNames: Map<string, string>;
  drawings: GroupableDrawing[];
}): CaPhotoGroup<P>[] {
  const drawingOrder = new Map(input.drawings.map((d, i) => [d.id, i]));
  const drawings = new Map(input.drawings.map((d) => [d.id, d]));
  const pins = new Map(input.pins.map((p) => [p.id, p]));

  const byPin = new Map<string, P[]>();
  const loose: P[] = [];
  for (const photo of input.photos) {
    if (photo.pinId && pins.has(photo.pinId)) {
      const list = byPin.get(photo.pinId) ?? [];
      list.push(photo);
      byPin.set(photo.pinId, list);
    } else {
      loose.push(photo);
    }
  }

  const rank = (pinId: string) => {
    const pin = pins.get(pinId)!;
    return [drawingOrder.get(pin.drawingId) ?? Number.MAX_SAFE_INTEGER, input.pinNumbers.get(pinId) ?? Number.MAX_SAFE_INTEGER];
  };

  const groups: CaPhotoGroup<P>[] = [...byPin.keys()]
    .sort((a, b) => {
      const [da, na] = rank(a);
      const [db, nb] = rank(b);
      return da - db || na - nb;
    })
    .map((pinId) => {
      const pin = pins.get(pinId)!;
      const drawing = drawings.get(pin.drawingId);
      return {
        key: pinId,
        title: input.pinNames.get(pinId) ?? "Pin",
        subtitle: drawing ? [drawing.sheetNumber, drawing.title].filter(Boolean).join(" · ") : undefined,
        photos: byPin.get(pinId)!,
      };
    });

  if (loose.length) groups.push({ key: NO_PIN_GROUP, title: "No pinned location", photos: loose });
  return groups;
}

/** Every photo id the report already uses (project photo and item photos). */
export function photoIdsInReport(content: { coverPhotoId?: string; items: { photos: { photoId: string }[] }[] }): Set<string> {
  const ids = new Set<string>();
  if (content.coverPhotoId) ids.add(content.coverPhotoId);
  for (const item of content.items) for (const p of item.photos) ids.add(p.photoId);
  return ids;
}
