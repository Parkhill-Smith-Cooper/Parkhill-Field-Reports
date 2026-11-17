"use client";

import "./caReport.css";

import { useEffect, useRef, useState } from "react";
import { LuArrowDown, LuArrowLeft, LuArrowRight, LuArrowUp, LuPlus, LuTrash2, LuX } from "react-icons/lu";

import { CaPhotoPicker } from "@/components/ca/CaPhotoPicker";
import { notifyError } from "@/components/ui/toaster";
import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import { newCaItemId } from "@/lib/ca/ids";
import { captureFiles } from "@/lib/ca/offline/photoStore";
import { itemNumber } from "@/lib/ca/reportContent";
import { formatLongDate, formatTime, move, photoRows } from "@/lib/ca/reportLayout";
import { CA_STATUS_LABELS, hasDeficientItems, isDeficient } from "@/lib/ca/status";
import { CA_ITEM_STATUSES, type CaItemPhoto, type CaItemStatus, type CaReportContent, type CaReportItem } from "@/types/ca";

import { Editable, PhotoSourceMenu } from "./editing";

const WEATHER = [
  ["clear", "Clear"],
  ["overcast", "Overcast"],
  ["rain", "Rain"],
  ["snow", "Snow"],
  ["foggy", "Foggy"],
  ["cold", "Cold"],
] as const;
const SITE = [
  ["clear", "Clear"],
  ["dusty", "Dusty"],
  ["muddy", "Muddy"],
] as const;

/** CSS string literal content, safe inside `content: "…"`. */
const cssString = (value: string) => value.replace(/["\\\n\r]/g, " ");

export type ReportEditing = {
  onChange: (next: CaReportContent) => void;
  projectNumber: string;
  /** The project's photos, for "Choose from project photos". */
  photos: CaPhotoView[];
  pinNames: Map<string, string>;
};

type PickerTarget = { kind: "cover" } | { kind: "item"; itemId: string };

/**
 * The Field Observation Report, rendered from the template's structure and
 * styles (caReport.css).
 *
 * - Without `editing`: the finished document (print preview, issued
 *   revisions).
 * - With `editing`: the SAME document, edited in place. Every text field is
 *   typed into where it appears, chips and distribution boxes toggle on tap,
 *   the status badge is a menu, and every photo box offers Take photo /
 *   Choose from device / Choose from project photos. On phones the page
 *   reflows to the screen width; the printed output is unchanged.
 *
 * Printing uses Chromium's page margin boxes for the footer and "Page X of Y",
 * as the template does; Safari and Firefox print without them.
 */
export function CaReportDocument({
  content,
  photoUrl,
  reportNumber,
  revision,
  dateIssued,
  editing,
}: {
  content: CaReportContent;
  /** URL for a photo id, or null if it is not available. */
  photoUrl: (photoId: string) => string | null;
  reportNumber: string | null;
  /** The issued revision shown, or null for an unissued draft. */
  revision: number | null;
  /** ISO time the shown revision was issued; null for a draft. */
  dateIssued: string | null;
  editing?: ReportEditing;
}) {
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const issued = revision !== null && dateIssued !== null;
  const issuedLabel = issued ? formatLongDate(dateIssued) : editing ? "Set when issued" : "Not issued (draft)";
  const coverUrl = content.coverPhotoId ? photoUrl(content.coverPhotoId) : null;
  const ed = editing;

  const set = <K extends keyof CaReportContent>(key: K, value: CaReportContent[K]) =>
    ed?.onChange({ ...content, [key]: value });
  const setItem = (id: string, patch: Partial<CaReportItem>) =>
    set(
      "items",
      content.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const captionOf = (id: string) => ed?.photos.find((p) => p.id === id)?.caption ?? "";

  /** Camera / device photos: saved to the project (offline-safe), then placed. */
  async function addFiles(target: PickerTarget, files: File[]) {
    if (!ed) return;
    try {
      const { saved, failed } = await captureFiles(ed.projectNumber, target.kind === "cover" ? files.slice(0, 1) : files);
      for (const f of failed) notifyError(`Could not save ${f.name}`, new Error(f.error));
      if (saved.length) place(target, saved);
    } catch (error) {
      notifyError("Could not add the photo", error);
    }
  }

  function place(target: PickerTarget, ids: string[]) {
    if (target.kind === "cover") return set("coverPhotoId", ids[0]);
    const item = content.items.find((i) => i.id === target.itemId);
    if (!item) return;
    const existing = new Set(item.photos.map((p) => p.photoId));
    setItem(item.id, {
      photos: [
        ...item.photos,
        ...ids.filter((id) => !existing.has(id)).map((id) => ({ photoId: id, caption: captionOf(id) })),
      ],
    });
  }

  const pickerItem = picker?.kind === "item" ? content.items.find((i) => i.id === picker.itemId) : undefined;

  const field = (label: string, key: "to" | "projectName" | "from" | "projectNo" | "percentComplete", placeholder?: string) => (
    <div className="fld">
      <div className="lb">{label}</div>
      {ed ? (
        <Editable as="div" className="v" value={content[key]} onChange={(v) => set(key, v)} label={label} placeholder={placeholder} />
      ) : (
        <div className="v">{content[key]}</div>
      )}
    </div>
  );

  return (
    <SheetScaler editing={Boolean(ed)}>
      <div className={`ca-report${ed ? " editing" : ""}`} data-print="ca-report" data-testid={ed ? "ca-report-editor" : "ca-report-document"}>
        {/* Date Issued in the printed footer, as the template's script does. */}
        <style>{`@page ca-report{@bottom-left{content:"Parkhill Field Observation Report  \\00B7  Date Issued: ${cssString(issued ? issuedLabel : "Not issued (draft)")}"}}`}</style>

        <table className="layout">
          <thead>
            <tr>
              <td>
                <div className="hdr">
                  <div className="band">
                    {/* eslint-disable-next-line @next/next/no-img-element -- print fidelity; plain img prints reliably */}
                    <img src="/ca-report-logo.png" className="logo" alt="Parkhill" />
                    <span className="ttl">Field Observation Report</span>
                    <span className="rev" data-testid="ca-report-rev">
                      {reportNumber ? `No. ${reportNumber}` : "No. —"}
                      {issued ? ` · Rev ${revision}` : " · Draft"}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {!issued && <div className="draftmark">DRAFT — NOT ISSUED</div>}

                <div className="info">
                  <div className="grid">
                    {field("To", "to", "Owner / client")}
                    {field("Project", "projectName")}
                    {field("From", "from")}
                    {field("Project No.", "projectNo")}
                    <div className="fld">
                      <div className="lb">Date Visited</div>
                      {ed ? (
                        <PickerField
                          type="date"
                          label="Date Visited"
                          value={content.dateVisited}
                          display={formatLongDate(content.dateVisited)}
                          onChange={(v) => set("dateVisited", v)}
                        />
                      ) : (
                        <div className="v">{formatLongDate(content.dateVisited)}</div>
                      )}
                    </div>
                    <div className="fld">
                      <div className="lb">Time</div>
                      {ed ? (
                        <PickerField
                          type="time"
                          label="Time"
                          value={content.timeVisited}
                          display={formatTime(content.timeVisited)}
                          onChange={(v) => set("timeVisited", v)}
                        />
                      ) : (
                        <div className="v">{formatTime(content.timeVisited)}</div>
                      )}
                    </div>
                    {field("% Complete", "percentComplete", "e.g. 45%")}
                    <div className="fld">
                      <div className="lb">Date Issued</div>
                      <div className={`v${ed && !issued ? " muted" : ""}`} data-testid="ca-report-date-issued">
                        {issuedLabel}
                      </div>
                    </div>
                  </div>

                  {ed ? (
                    <PhotoSourceMenu
                      label={coverUrl ? "Change the project photo" : "Add the project photo"}
                      multiple={false}
                      onFiles={(files) => void addFiles({ kind: "cover" }, files)}
                      onPickExisting={() => setPicker({ kind: "cover" })}
                      onRemove={content.coverPhotoId ? () => set("coverPhotoId", undefined) : undefined}
                    >
                      <button type="button" className={`pphoto tap${coverUrl ? " has" : ""}`} data-testid="ca-cover-box">
                        {coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- print fidelity
                          <img src={coverUrl} alt="Project photo" />
                        ) : (
                          <>
                            <LuPlus className="screen-only" aria-hidden />
                            PROJECT PHOTO
                          </>
                        )}
                      </button>
                    </PhotoSourceMenu>
                  ) : coverUrl ? (
                    <div className="pphoto has">
                      {/* eslint-disable-next-line @next/next/no-img-element -- print fidelity */}
                      <img src={coverUrl} alt="Project photo" />
                    </div>
                  ) : (
                    <div className="pphoto">PROJECT PHOTO</div>
                  )}
                </div>

                <div className="body">
                  <div className="cond">
                    <div className="grp">
                      <span className="sl">Weather</span>
                      {WEATHER.map(([key, label]) =>
                        ed ? (
                          <button
                            key={key}
                            type="button"
                            className={`chip tap${content.weather[key] ? " on" : " off"}`}
                            aria-pressed={content.weather[key]}
                            aria-label={`Weather: ${label}`}
                            onClick={() => set("weather", { ...content.weather, [key]: !content.weather[key] })}
                          >
                            {label}
                          </button>
                        ) : content.weather[key] ? (
                          <span key={key} className="chip on">
                            {label}
                          </span>
                        ) : null,
                      )}
                      {ed ? (
                        <span className="chip temp">
                          Temp: <Editable value={content.temperature} onChange={(v) => set("temperature", v)} label="Temperature" placeholder="—" />
                        </span>
                      ) : (
                        content.temperature && <span className="chip temp">Temp: {content.temperature}</span>
                      )}
                    </div>
                    <div className="grp">
                      <span className="sl">Site Conditions</span>
                      {SITE.map(([key, label]) =>
                        ed ? (
                          <button
                            key={key}
                            type="button"
                            className={`chip tap${content.site[key] ? " on" : " off"}`}
                            aria-pressed={content.site[key]}
                            aria-label={`Site: ${label}`}
                            onClick={() => set("site", { ...content.site, [key]: !content.site[key] })}
                          >
                            {label}
                          </button>
                        ) : content.site[key] ? (
                          <span key={key} className="chip on">
                            {label}
                          </span>
                        ) : null,
                      )}
                      {ed ? (
                        <span className={`chip${content.site.other ? " on" : " off"}`}>
                          Other:{" "}
                          <Editable
                            value={content.site.other}
                            onChange={(v) => set("site", { ...content.site, other: v })}
                            label="Other site condition"
                            placeholder="—"
                          />
                        </span>
                      ) : (
                        content.site.other && <span className="chip on">Other: {content.site.other}</span>
                      )}
                    </div>
                  </div>

                  {hasDeficientItems(content.items) && (
                    <div className="notice" data-testid="ca-report-notice">
                      <h4>NOTICE OF DEFICIENT ITEMS</h4>
                      <p>
                        Observed work includes items that appear to be deficient, incomplete, or not in conformance
                        with the contract documents. The Contractor is requested to review these items and take
                        appropriate corrective action.
                      </p>
                    </div>
                  )}

                  <h3>Site Activity</h3>
                  <div className="subh">Persons Contacted / Present</div>
                  <table className="people">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Email</th>
                        {ed && <th className="screen-only row-x" aria-label="Remove" />}
                      </tr>
                    </thead>
                    <tbody>
                      {content.persons.length > 0 ? (
                        content.persons.map((p, i) => (
                          <tr key={i}>
                            {(["name", "company", "email"] as const).map((k) => (
                              <td key={k}>
                                {ed ? (
                                  <Editable
                                    as="div"
                                    value={p[k]}
                                    label={`Person ${i + 1} ${k}`}
                                    placeholder={k === "name" ? "Name" : k === "company" ? "Company" : "Email"}
                                    onChange={(v) =>
                                      set(
                                        "persons",
                                        content.persons.map((x, j) => (j === i ? { ...x, [k]: v } : x)),
                                      )
                                    }
                                  />
                                ) : (
                                  p[k]
                                )}
                              </td>
                            ))}
                            {ed && (
                              <td className="screen-only row-x">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label={`Remove person ${i + 1}`}
                                  onClick={() => set("persons", content.persons.filter((_, j) => j !== i))}
                                >
                                  <LuX />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={ed ? 4 : 3} className="none">
                            None recorded
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {ed && (
                    <button
                      type="button"
                      className="add-link screen-only"
                      onClick={() => set("persons", [...content.persons, { name: "", company: "", email: "" }])}
                    >
                      <LuPlus aria-hidden /> Add person
                    </button>
                  )}
                  <p>
                    <b>Materials Stored On-Site:</b>{" "}
                    {ed ? (
                      <Editable multiline value={content.materialsStored} onChange={(v) => set("materialsStored", v)} label="Materials stored on-site" />
                    ) : (
                      content.materialsStored
                    )}
                  </p>
                  <p>
                    <b>Requested Action Items by Client:</b>{" "}
                    {ed ? (
                      <Editable
                        multiline
                        value={content.clientActionItems}
                        onChange={(v) => set("clientActionItems", v)}
                        label="Requested action items by client"
                      />
                    ) : (
                      content.clientActionItems
                    )}
                  </p>

                  <h3>Work in Progress</h3>
                  <p>
                    <b>Summary of Work Progress:</b>{" "}
                    {ed ? (
                      <Editable multiline value={content.workSummary} onChange={(v) => set("workSummary", v)} label="Summary of work progress" />
                    ) : (
                      content.workSummary
                    )}
                  </p>
                  <p className="disc">
                    Photos are intended to generally show the progress of the project. They are not intended to
                    indicate the quality or deficiency of the work unless specifically noted.
                  </p>

                  {content.items.map((item, index) => (
                    <Item
                      key={item.id}
                      item={item}
                      index={index}
                      total={content.items.length}
                      photoUrl={photoUrl}
                      editing={
                        ed && {
                          change: (patch) => setItem(item.id, patch),
                          move: (delta) => set("items", move(content.items, index, delta)),
                          remove: () => set("items", content.items.filter((i) => i.id !== item.id)),
                          addFiles: (files) => void addFiles({ kind: "item", itemId: item.id }, files),
                          pickExisting: () => setPicker({ kind: "item", itemId: item.id }),
                        }
                      }
                    />
                  ))}
                  {ed && (
                    <button
                      type="button"
                      className="add-item screen-only"
                      onClick={() =>
                        set("items", [...content.items, { id: newCaItemId(), status: "in-progress", description: "", photos: [] }])
                      }
                    >
                      <LuPlus aria-hidden /> Add observation item
                    </button>
                  )}

                  <h3>Comments</h3>
                  {ed ? (
                    <Editable as="p" multiline value={content.comments} onChange={(v) => set("comments", v)} label="Comments" placeholder="Click to add comments" />
                  ) : (
                    <p>{content.comments}</p>
                  )}

                  <div className="dist">
                    <span className="k">DISTRIBUTION</span>
                    {(["owner", "parkhill", "contractor"] as const).map((k) => {
                      const label = k === "owner" ? "Owner" : k === "parkhill" ? "Parkhill" : "Contractor";
                      return ed ? (
                        <button
                          key={k}
                          type="button"
                          className="dist-opt tap"
                          role="checkbox"
                          aria-checked={content.distribution[k]}
                          onClick={() => set("distribution", { ...content.distribution, [k]: !content.distribution[k] })}
                        >
                          <span className={`box${content.distribution[k] ? " on" : ""}`} />
                          <span className="o">{label}</span>
                        </button>
                      ) : (
                        <span key={k} className="dist-opt">
                          <span className={`box${content.distribution[k] ? " on" : ""}`} />
                          <span className="o">{label}</span>
                        </span>
                      );
                    })}
                  </div>

                  <div className="screen-footer screen-only">
                    <span>Parkhill Field Observation Report · Date Issued: {issued ? issuedLabel : "Not issued (draft)"}</span>
                    <b>Building Community</b>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {ed && (
        <CaPhotoPicker
          open={picker !== null}
          title={picker?.kind === "cover" ? "Choose the project photo" : "Add photos to this item"}
          single={picker?.kind === "cover"}
          photos={ed.photos}
          pinNames={ed.pinNames}
          exclude={pickerItem ? pickerItem.photos.map((p) => p.photoId) : []}
          onClose={() => setPicker(null)}
          onPick={(ids) => picker && place(picker, ids)}
        />
      )}
    </SheetScaler>
  );
}

type ItemEditing = {
  change: (patch: Partial<CaReportItem>) => void;
  move: (delta: -1 | 1) => void;
  remove: () => void;
  addFiles: (files: File[]) => void;
  pickExisting: () => void;
};

type Cell = { kind: "photo"; photo: CaItemPhoto; index: number } | { kind: "add" };

function Item({
  item,
  index,
  total,
  photoUrl,
  editing,
}: {
  item: CaReportItem;
  index: number;
  total: number;
  photoUrl: (photoId: string) => string | null;
  editing?: ItemEditing;
}) {
  const number = itemNumber(index);
  const label = `Item ${number}`;
  const [confirmRemove, setConfirmRemove] = useState(false);

  // In edit mode an "add photo" box follows the last photo; it never prints,
  // so a lone photo still prints alone in the left column.
  const cells: Cell[] = item.photos.map((photo, i) => ({ kind: "photo", photo, index: i }));
  if (editing && item.photos.length > 0) cells.push({ kind: "add" });
  const rows = photoRows(cells);

  const addBox = (key: string, screenOnly: boolean) =>
    editing && (
      <figure key={key} className={`ph${screenOnly ? " screen-only" : ""}`}>
        <PhotoSourceMenu label={`Add a photo to ${label}`} onFiles={editing.addFiles} onPickExisting={editing.pickExisting}>
          <button type="button" className="photo tap add" data-testid="ca-add-photo-box">
            <LuPlus className="screen-only" aria-hidden /> Photo
          </button>
        </PhotoSourceMenu>
      </figure>
    );

  const renderCell = (cell: Cell, i: number) => {
    if (cell.kind === "add") return addBox(`add-${i}`, true);
    const { photo, index: pi } = cell;
    const url = photoUrl(photo.photoId);
    return (
      <figure key={photo.photoId} className="ph">
        {url ? (
          <div className="photo has">
            {/* eslint-disable-next-line @next/next/no-img-element -- print fidelity */}
            <img src={url} alt={`${label} photo`} />
            {editing && (
              <div className="ph-tools screen-only">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Move photo earlier"
                  disabled={pi === 0}
                  onClick={() => editing.change({ photos: move(item.photos, pi, -1) })}
                >
                  <LuArrowLeft />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Move photo later"
                  disabled={pi === item.photos.length - 1}
                  onClick={() => editing.change({ photos: move(item.photos, pi, 1) })}
                >
                  <LuArrowRight />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove photo ${pi + 1} from ${label}`}
                  onClick={() => editing.change({ photos: item.photos.filter((_, j) => j !== pi) })}
                >
                  <LuX />
                </button>
              </div>
            )}
          </div>
        ) : (
          // Deleted, or not on this device yet: still removable from the report.
          <div className="photo has">
            Photo not available
            {editing && (
              <div className="ph-tools screen-only">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove photo ${pi + 1} from ${label}`}
                  onClick={() => editing.change({ photos: item.photos.filter((_, j) => j !== pi) })}
                >
                  <LuX />
                </button>
              </div>
            )}
          </div>
        )}
        {editing ? (
          <Editable
            as="div"
            className="pcap"
            value={photo.caption}
            label={`${label} photo ${pi + 1} caption`}
            placeholder="Add a caption"
            onChange={(v) => editing.change({ photos: item.photos.map((p, j) => (j === pi ? { ...p, caption: v } : p)) })}
          />
        ) : (
          photo.caption && <figcaption className="pcap">{photo.caption}</figcaption>
        )}
      </figure>
    );
  };

  const heading = (
    <>
      <div className="ih">
        <b>{label}</b>
        <span className={`badge${isDeficient(item.status) ? " def" : ""}${editing ? " tap" : ""}`}>
          {CA_STATUS_LABELS[item.status]}
          {editing && (
            <select
              className="badge-select"
              aria-label={`${label} status`}
              value={item.status}
              onChange={(e) => editing.change({ status: e.currentTarget.value as CaItemStatus })}
            >
              {CA_ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CA_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </span>
      </div>
      {editing ? (
        <Editable
          as="p"
          multiline
          value={item.description}
          onChange={(v) => editing.change({ description: v })}
          label={`${label} description`}
          placeholder="Describe what was observed"
        />
      ) : (
        <p>{item.description}</p>
      )}
    </>
  );

  return (
    <div
      className={`item${rows.length > 1 ? " long" : ""}`}
      data-testid={editing ? "ca-editor-item" : "ca-report-item"}
    >
      {editing && (
        <div className="item-tools screen-only">
          {confirmRemove ? (
            <>
              <span className="confirm">Remove {label}?</span>
              <button type="button" className="text-btn" onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
              <button type="button" className="text-btn danger" onClick={editing.remove}>
                Remove item
              </button>
            </>
          ) : (
            <>
              <button type="button" className="icon-btn" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => editing.move(-1)}>
                <LuArrowUp />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${label} down`}
                disabled={index === total - 1}
                onClick={() => editing.move(1)}
              >
                <LuArrowDown />
              </button>
              <button type="button" className="icon-btn" aria-label={`Remove ${label}`} onClick={() => setConfirmRemove(true)}>
                <LuTrash2 />
              </button>
            </>
          )}
        </div>
      )}
      <div className="keep">
        {heading}
        {rows.length === 0 ? (
          // No photos: the template's two empty "Photo" boxes - tappable when editing.
          <div className="photo-row" data-testid="ca-report-photo-row">
            {editing ? (
              [addBox("empty-a", false), addBox("empty-b", false)]
            ) : (
              <>
                <figure className="ph">
                  <div className="photo">Photo</div>
                </figure>
                <figure className="ph">
                  <div className="photo">Photo</div>
                </figure>
              </>
            )}
          </div>
        ) : (
          <div className={`photo-row${rows[0].every((c) => c.kind === "add") ? " screen-only" : ""}`} data-testid="ca-report-photo-row">
            {rows[0].map(renderCell)}
          </div>
        )}
      </div>
      {rows.slice(1).map((row, r) => (
        <div
          key={r}
          className={`photo-row${row.every((c) => c.kind === "add") ? " screen-only" : ""}`}
          data-testid="ca-report-photo-row"
        >
          {row.map(renderCell)}
        </div>
      ))}
    </div>
  );
}

/** A date or time shown in the template's format; tapping opens the device picker. */
function PickerField({
  type,
  label,
  value,
  display,
  onChange,
}: {
  type: "date" | "time";
  label: string;
  value: string;
  display: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="v ef-pick">
      <span className={value ? "" : "ph-text"}>{display || "Click to set"}</span>
      <input
        type={type}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Some browsers only allow showPicker from certain gestures.
          }
        }}
      />
    </label>
  );
}

/**
 * The Letter-width sheet. For viewing it scales down to fit narrow screens,
 * so the preview looks like the printed page. For editing on a narrow screen
 * it reflows to the screen width instead (a scaled-down page is too small to
 * type into); the template's typography and colours are kept. Printing
 * ignores both.
 */
function SheetScaler({ children, editing }: { children: React.ReactNode; editing: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetPx = 8.5 * 96;
  const compact = editing && width !== null && width < 700;
  const zoom = !compact && width !== null ? Math.min(1, width / sheetPx) : 1;

  return (
    <div ref={outer} data-print="document" style={{ width: "100%" }}>
      <div className={`ca-report-sheet${compact ? " compact" : ""}`} style={compact ? undefined : { zoom }}>
        {children}
      </div>
    </div>
  );
}
