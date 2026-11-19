"use client";

import { useEffect, useRef, useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";

import { photoRows } from "@/lib/ca/reportLayout";
import { clampZoom, insetView, INSET_HEIGHT, INSET_WIDTH, MIN_ZOOM } from "@/lib/ca/reportLocations";
import type { CaItemPhoto, CaReportLocation } from "@/types/ca";

/** Zoom change per button press, and per wheel notch. */
const BUTTON_STEP = 1.5;
const WHEEL_STEP = 1.2;

/**
 * The report's "Photo Locations" pages: one section per pin, with its photos
 * and their captions, and the floor plan in the section's top-right corner
 * showing where they were taken. Starts on a new page when printed.
 */
export function LocationPages({
  locations,
  zoom,
  photoUrl,
  drawingUrl,
  onZoom,
}: {
  locations: CaReportLocation[];
  /** Saved zoom per pin id. */
  zoom: Record<string, number>;
  photoUrl: (photoId: string) => string | null;
  drawingUrl: (drawingId: string) => string | null;
  /** Editing only: saves a pin's zoom. */
  onZoom?: (pinId: string, zoom: number) => void;
}) {
  if (locations.length === 0) return null;
  return (
    <div className="locs" data-testid="ca-locations">
      <h3>Photo Locations</h3>
      {locations.map((location) => (
        <LocationSection
          key={location.pinId}
          location={location}
          zoom={zoom[location.pinId] ?? MIN_ZOOM}
          photoUrl={photoUrl}
          drawingUrl={location.drawing ? drawingUrl(location.drawing.id) : null}
          onZoom={onZoom && ((z) => onZoom(location.pinId, z))}
        />
      ))}
    </div>
  );
}

function LocationSection({
  location,
  zoom,
  photoUrl,
  drawingUrl,
  onZoom,
}: {
  location: CaReportLocation;
  zoom: number;
  photoUrl: (photoId: string) => string | null;
  drawingUrl: string | null;
  onZoom?: (zoom: number) => void;
}) {
  const rows = photoRows(location.photos);
  const count = location.photos.length;
  const figure = (photo: CaItemPhoto) => {
    const url = photoUrl(photo.photoId);
    return (
      <figure key={photo.photoId} className="ph">
        <div className="photo has">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- print fidelity
            <img src={url} alt={photo.caption || `Photo at ${location.title}`} />
          ) : (
            "Photo not available"
          )}
        </div>
        <figcaption className="pcap">
          {photo.caption ||
            (onZoom && <span className="screen-only muted-cap">No caption — add one on the observation item</span>)}
        </figcaption>
      </figure>
    );
  };

  return (
    <section className={`loc${rows.length > 1 ? " long" : ""}`} data-testid="ca-location">
      <div className="keep">
        <div className="loc-head">
          <div className="loc-text">
            <div className="loc-k">Location</div>
            <div className="loc-title" data-testid="ca-location-title">
              {location.title}
            </div>
            {location.subtitle && <div className="loc-sub">{location.subtitle}</div>}
            <div className="loc-n">
              {count} photo{count === 1 ? "" : "s"}
            </div>
          </div>
          <FloorPlanInset location={location} url={drawingUrl} zoom={zoom} onZoom={onZoom} />
        </div>
        {rows[0] && <div className="photo-row">{rows[0].map(figure)}</div>}
      </div>
      {rows.slice(1).map((row, i) => (
        <div key={i} className="photo-row">
          {row.map(figure)}
        </div>
      ))}
    </section>
  );
}

/**
 * The floor plan around the pin, always the same size and in the same corner.
 *
 * When editing, a click starts zooming: the wheel or the − / + buttons zoom
 * around the pin, and clicking anywhere outside (or tabbing away) saves the
 * zoom into the report. Escape puts it back as it was.
 */
function FloorPlanInset({
  location,
  url,
  zoom,
  onZoom,
}: {
  location: CaReportLocation;
  url: string | null;
  zoom: number;
  onZoom?: (zoom: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState(zoom);
  // The zoom being edited, readable from the document listeners below.
  const draftRef = useRef(zoom);
  const commitRef = useRef<() => void>(() => {});

  const shown = active ? draft : zoom;
  const editable = Boolean(onZoom);

  function setZoom(next: number) {
    const value = clampZoom(next);
    draftRef.current = value;
    setDraft(value);
  }
  function start() {
    if (!editable || active) return;
    draftRef.current = zoom;
    setDraft(zoom);
    setActive(true);
  }
  function commit() {
    setActive(false);
    if (draftRef.current !== zoom) onZoom?.(draftRef.current);
  }
  function cancel() {
    setActive(false);
  }

  useEffect(() => {
    commitRef.current = commit;
  });

  // While zooming: the wheel zooms (not scrolls), and a click outside saves.
  useEffect(() => {
    const el = box.current;
    if (!active || !el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(draftRef.current * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!el.contains(event.target as Node)) commitRef.current();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active]);

  const drawing = location.drawing;
  const view = drawing
    ? insetView({ sheetWidth: drawing.width, sheetHeight: drawing.height, x: location.x, y: location.y, zoom: shown })
    : null;

  return (
    <div
      ref={box}
      className={`loc-plan${editable ? " tap" : ""}${active ? " active" : ""}`}
      style={{ width: INSET_WIDTH, height: INSET_HEIGHT }}
      data-testid="ca-location-plan"
      data-zoom={shown}
      {...(editable && {
        role: "button",
        tabIndex: 0,
        "aria-label": `Floor plan at ${location.title}, zoom ${shown}×. ${active ? "Use + and − to zoom; Enter saves, Escape cancels." : "Click to zoom."}`,
        onClick: start,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (!active) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              start();
            }
            return;
          }
          if (event.key === "+" || event.key === "=") setZoom(draftRef.current * BUTTON_STEP);
          else if (event.key === "-") setZoom(draftRef.current / BUTTON_STEP);
          else if (event.key === "Enter") commit();
          else if (event.key === "Escape") cancel();
          else return;
          event.preventDefault();
        },
        onBlur: (event: React.FocusEvent) => {
          if (active && !event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
        },
      })}
    >
      {view && url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- print fidelity */}
          <img
            src={url}
            alt={`Floor plan${location.subtitle ? `, ${location.subtitle}` : ""}`}
            draggable={false}
            style={{ left: view.left, top: view.top, width: view.width, height: view.height }}
          />
          <span className="loc-pin" style={{ left: view.pinLeft, top: view.pinTop }} aria-hidden />
        </>
      ) : (
        <span className="loc-missing">Floor plan not available</span>
      )}
      {editable && !active && <span className="loc-hint screen-only">Click to zoom</span>}
      {active && (
        <div className="loc-zoom screen-only" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(draftRef.current / BUTTON_STEP)}>
            <LuMinus />
          </button>
          <span className="loc-level">{shown.toFixed(1)}×</span>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(draftRef.current * BUTTON_STEP)}>
            <LuPlus />
          </button>
        </div>
      )}
    </div>
  );
}
