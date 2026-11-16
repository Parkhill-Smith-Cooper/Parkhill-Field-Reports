import type { CaItemPhoto, CaReportItem } from "@/types/ca";

/**
 * Layout rules for the printed Field Observation Report. Pure, so they are
 * unit-tested and shared by the editor preview and the print page.
 */

/**
 * Photos in rows of two. Each row is printed as one unbreakable block (a row
 * is never split across pages); a lone photo sits in the left column. Zero
 * photos gives zero rows - the renderer then shows the template's two empty
 * "Photo" boxes.
 */
export function photoRows<T>(photos: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < photos.length; i += 2) rows.push(photos.slice(i, i + 2));
  return rows;
}

type SourcePhoto = { id: string; caption: string; pinId?: string; takenAt: string };
type SourcePin = { id: string; label: string; note: string };

/**
 * "Create report from selected photos": one observation item per pin (in the
 * order its first selected photo was taken), then one item for any selected
 * photos not on a live pin. Captions come from the photos; the description
 * starts from the pin's label and note so the engineer only has to refine it.
 */
export function itemsFromPhotos(input: {
  photos: SourcePhoto[];
  pins: SourcePin[];
  /** Display names for pins ("Pin 3" when unlabelled). */
  pinNames: Map<string, string>;
  newId: () => string;
}): CaReportItem[] {
  const pins = new Map(input.pins.map((p) => [p.id, p]));
  const groups = new Map<string, SourcePhoto[]>();
  const loose: SourcePhoto[] = [];

  for (const photo of [...input.photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
    if (photo.pinId && pins.has(photo.pinId)) {
      const group = groups.get(photo.pinId) ?? [];
      group.push(photo);
      groups.set(photo.pinId, group);
    } else {
      loose.push(photo);
    }
  }

  const toPhotos = (list: SourcePhoto[]): CaItemPhoto[] => list.map((p) => ({ photoId: p.id, caption: p.caption }));

  const items: CaReportItem[] = [...groups].map(([pinId, list]) => {
    const pin = pins.get(pinId)!;
    const name = input.pinNames.get(pinId) ?? pin.label;
    return {
      id: input.newId(),
      status: "in-progress",
      description: [name, pin.note.trim()].filter(Boolean).join(": "),
      photos: toPhotos(list),
      pinId,
    };
  });
  if (loose.length > 0) {
    items.push({ id: input.newId(), status: "in-progress", description: "", photos: toPhotos(loose) });
  }
  return items;
}

/** Moves an element up or down by one; out-of-range moves leave the list unchanged. */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** "July 14, 2026", from `yyyy-mm-dd` or an ISO timestamp, without time-zone drift for plain dates. */
export function formatLongDate(value: string): string {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "9:30 AM" from `HH:mm`. */
export function formatTime(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const h = Number(match[1]);
  return `${((h + 11) % 12) + 1}:${match[2]} ${h < 12 ? "AM" : "PM"}`;
}
