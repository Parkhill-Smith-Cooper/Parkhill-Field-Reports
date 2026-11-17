/**
 * Site Route: the order an engineer moved through the site, reconstructed
 * from WHEN photos were taken at each floor-plan pin.
 *
 * This is deliberately not location tracking. It uses only the pins the
 * engineer placed and the photo timestamps, both of which are exact, and it
 * says nothing about the path walked between pins. Live tracking ("Start
 * Tracking") is a placeholder until a positioning approach is chosen - see
 * docs/ca-positioning-research.md.
 */

type RoutePin = {
  id: string;
  drawingId: string;
  x: number;
  y: number;
  label: string;
  deleted?: boolean;
};

type RoutePhoto = { id: string; pinId?: string; takenAt: string };

export type RouteStop = {
  pinId: string;
  /** 1-based position along the route. */
  step: number;
  x: number;
  y: number;
  label: string;
  /** First and last photo at this pin (within the selected day). */
  firstAt: string;
  lastAt: string;
  photoCount: number;
};

/** A timestamp's calendar day on this device, `yyyy-mm-dd`. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Days on which photos were taken at pins on this drawing, newest first. */
export function routeDays(pins: RoutePin[], photos: RoutePhoto[], drawingId: string): string[] {
  const onSheet = new Set(pins.filter((p) => !p.deleted && p.drawingId === drawingId).map((p) => p.id));
  const days = new Set(photos.filter((p) => p.pinId && onSheet.has(p.pinId)).map((p) => localDay(p.takenAt)));
  return [...days].sort().reverse();
}

/**
 * Pins on `drawingId` that have photos (on `day`, if given), ordered by their
 * first photo. Pins without photos are not stops: there is no time to place
 * them on the route. Ties keep pin creation order.
 */
export function buildSiteRoute(input: {
  pins: RoutePin[];
  photos: RoutePhoto[];
  drawingId: string;
  day?: string | null;
}): { stops: RouteStop[]; pinsWithoutPhotos: number } {
  const pins = input.pins.filter((p) => !p.deleted && p.drawingId === input.drawingId);
  const byPin = new Map<string, string[]>();
  for (const photo of input.photos) {
    if (!photo.pinId) continue;
    if (input.day && localDay(photo.takenAt) !== input.day) continue;
    const times = byPin.get(photo.pinId) ?? [];
    times.push(photo.takenAt);
    byPin.set(photo.pinId, times);
  }

  const stops = pins
    .map((pin, index) => {
      const times = (byPin.get(pin.id) ?? []).sort();
      return { pin, index, times };
    })
    .filter((s) => s.times.length > 0)
    .sort((a, b) => a.times[0].localeCompare(b.times[0]) || a.index - b.index)
    .map(({ pin, times }, i) => ({
      pinId: pin.id,
      step: i + 1,
      x: pin.x,
      y: pin.y,
      label: pin.label,
      firstAt: times[0],
      lastAt: times[times.length - 1],
      photoCount: times.length,
    }));

  const withPhotosEver = new Set(input.photos.map((p) => p.pinId).filter(Boolean));
  return {
    stops,
    pinsWithoutPhotos: pins.filter((p) => !withPhotosEver.has(p.id)).length,
  };
}
