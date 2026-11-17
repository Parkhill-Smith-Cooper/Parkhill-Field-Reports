/**
 * Pin numbering and names. Pins are numbered per drawing in the order they
 * were dropped (1, 2, 3 …), and a pin without a label is called "Pin {n}".
 */

type NumberablePin = { id: string; drawingId: string; createdAt: string; label: string; deleted?: boolean };

export function numberPins(pins: NumberablePin[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const pin of [...pins].filter((p) => !p.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const n = (counters.get(pin.drawingId) ?? 0) + 1;
    counters.set(pin.drawingId, n);
    numbers.set(pin.id, n);
  }
  return numbers;
}

export function pinName(pin: { label: string }, number: number | undefined): string {
  return pin.label.trim() || `Pin ${number ?? "?"}`;
}
