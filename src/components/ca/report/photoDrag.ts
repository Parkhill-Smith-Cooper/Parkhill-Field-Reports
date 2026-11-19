/**
 * Drag and drop of project photos from the editor's photo panel onto the
 * report's photo boxes. Native HTML drag and drop (mouse / trackpad); on
 * touch screens the photo boxes' menus ("Choose from project photos") do the
 * same job.
 *
 * Only drags that carry this app's photo type are accepted, so dropping a
 * file or a piece of text on a box does nothing.
 */

export const CA_PHOTO_DRAG_TYPE = "application/x-ca-photo-ids";

/** The highlight shown on a box while photos are dragged over it (screen only). */
const OVER_CLASS = "drop-over";

export function setDraggedPhotos(event: React.DragEvent, photoIds: string[]) {
  event.dataTransfer.setData(CA_PHOTO_DRAG_TYPE, JSON.stringify(photoIds));
  event.dataTransfer.effectAllowed = "copy";
  if (photoIds.length > 1) setCountDragImage(event, photoIds.length);
}

/** Clears any box left highlighted, e.g. when a drag is cancelled over it. */
export function clearDropHighlights() {
  for (const el of document.querySelectorAll(`.${OVER_CLASS}`)) el.classList.remove(OVER_CLASS);
}

function carriesPhotos(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes(CA_PHOTO_DRAG_TYPE);
}

function readDraggedPhotos(event: React.DragEvent): string[] {
  try {
    const value: unknown = JSON.parse(event.dataTransfer.getData(CA_PHOTO_DRAG_TYPE) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Props that make an element a drop target for dragged photos. The hover
 * highlight is a class toggled on the element itself, so no re-render runs
 * while dragging.
 */
export function photoDropProps(onDrop: (photoIds: string[]) => void) {
  return {
    "data-photo-drop": "",
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      if (!carriesPhotos(event)) return;
      event.preventDefault();
      event.currentTarget.classList.add(OVER_CLASS);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (!carriesPhotos(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      event.currentTarget.classList.remove(OVER_CLASS);
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.currentTarget.classList.remove(OVER_CLASS);
      if (!carriesPhotos(event)) return;
      event.preventDefault();
      const ids = readDraggedPhotos(event);
      if (ids.length) onDrop(ids);
    },
  };
}

/** A small "3 photos" label under the pointer instead of one thumbnail. */
function setCountDragImage(event: React.DragEvent, count: number) {
  const label = document.createElement("div");
  label.textContent = `${count} photos`;
  Object.assign(label.style, {
    position: "fixed",
    top: "-100px",
    left: "-100px",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#c8102e",
    color: "#fff",
    font: "600 13px system-ui, sans-serif",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(label);
  event.dataTransfer.setDragImage(label, 12, 12);
  setTimeout(() => label.remove(), 0);
}
