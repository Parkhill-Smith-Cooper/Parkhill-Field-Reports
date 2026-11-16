"use client";

import "./caReport.css";

import { useEffect, useRef, useState } from "react";

import { itemNumber } from "@/lib/ca/reportContent";
import { formatLongDate, formatTime, photoRows } from "@/lib/ca/reportLayout";
import { CA_STATUS_LABELS, hasDeficientItems, isDeficient } from "@/lib/ca/status";
import type { CaReportContent } from "@/types/ca";

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

/**
 * The Field Observation Report, rendered from the template's structure and
 * styles (caReport.css). Used for both the on-screen preview and printing.
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
}: {
  content: CaReportContent;
  /** URL for a photo id, or null if it is not available. */
  photoUrl: (photoId: string) => string | null;
  reportNumber: string | null;
  /** The issued revision shown, or null for an unissued draft. */
  revision: number | null;
  /** ISO time the shown revision was issued; null for a draft. */
  dateIssued: string | null;
}) {
  const issued = revision !== null && dateIssued !== null;
  const issuedLabel = issued ? formatLongDate(dateIssued) : "Not issued (draft)";
  const coverUrl = content.coverPhotoId ? photoUrl(content.coverPhotoId) : null;
  const weatherOn = WEATHER.filter(([key]) => content.weather[key]);
  const siteOn = SITE.filter(([key]) => content.site[key]);

  return (
    <SheetScaler>
      <div className="ca-report" data-print="ca-report" data-testid="ca-report-document">
        {/* Date Issued in the printed footer, as the template's script does. */}
        <style>{`@page ca-report{@bottom-left{content:"Parkhill Field Observation Report  \\00B7  Date Issued: ${cssString(issuedLabel)}"}}`}</style>

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
                    <Field label="To" value={content.to} />
                    <Field label="Project" value={content.projectName} />
                    <Field label="From" value={content.from} />
                    <Field label="Project No." value={content.projectNo} />
                    <Field label="Date Visited" value={formatLongDate(content.dateVisited)} />
                    <Field label="Time" value={formatTime(content.timeVisited)} />
                    <Field label="% Complete" value={content.percentComplete} />
                    <Field label="Date Issued" value={issuedLabel} testId="ca-report-date-issued" />
                  </div>
                  {coverUrl ? (
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
                      {weatherOn.map(([key, label]) => (
                        <span key={key} className="chip on">
                          {label}
                        </span>
                      ))}
                      {content.temperature && <span className="chip temp">Temp: {content.temperature}</span>}
                    </div>
                    <div className="grp">
                      <span className="sl">Site Conditions</span>
                      {siteOn.map(([key, label]) => (
                        <span key={key} className="chip on">
                          {label}
                        </span>
                      ))}
                      {content.site.other && <span className="chip on">Other: {content.site.other}</span>}
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
                      </tr>
                    </thead>
                    <tbody>
                      {content.persons.length > 0 ? (
                        content.persons.map((p, i) => (
                          <tr key={i}>
                            <td>{p.name}</td>
                            <td>{p.company}</td>
                            <td>{p.email}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="none">
                            None recorded
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p>
                    <b>Materials Stored On-Site:</b> {content.materialsStored}
                  </p>
                  <p>
                    <b>Requested Action Items by Client:</b> {content.clientActionItems}
                  </p>

                  <h3>Work in Progress</h3>
                  <p>
                    <b>Summary of Work Progress:</b> {content.workSummary}
                  </p>
                  <p className="disc">
                    Photos are intended to generally show the progress of the project. They are not intended to
                    indicate the quality or deficiency of the work unless specifically noted.
                  </p>

                  {content.items.map((item, index) => {
                    const rows = photoRows(item.photos);
                    const number = itemNumber(index);
                    const heading = (
                      <>
                        <div className="ih">
                          <b>Item {number}</b>
                          <span className={`badge${isDeficient(item.status) ? " def" : ""}`}>
                            {CA_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <p>{item.description}</p>
                      </>
                    );
                    return (
                      <div key={item.id} className={`item${rows.length > 1 ? " long" : ""}`} data-testid="ca-report-item">
                        <div className="keep">
                          {heading}
                          {rows.length === 0 ? (
                            <div className="photo-row" data-testid="ca-report-photo-row">
                              <figure className="ph">
                                <div className="photo">Photo</div>
                              </figure>
                              <figure className="ph">
                                <div className="photo">Photo</div>
                              </figure>
                            </div>
                          ) : (
                            <PhotoRow row={rows[0]} number={number} photoUrl={photoUrl} />
                          )}
                        </div>
                        {rows.slice(1).map((row, i) => (
                          <PhotoRow key={i} row={row} number={number} photoUrl={photoUrl} />
                        ))}
                      </div>
                    );
                  })}

                  <h3>Comments</h3>
                  <p>{content.comments}</p>

                  <div className="dist">
                    <span className="k">DISTRIBUTION</span>
                    <span className={`box${content.distribution.owner ? " on" : ""}`} />
                    <span className="o">Owner</span>
                    <span className={`box${content.distribution.parkhill ? " on" : ""}`} />
                    <span className="o">Parkhill</span>
                    <span className={`box${content.distribution.contractor ? " on" : ""}`} />
                    <span className="o">Contractor</span>
                  </div>

                  <div className="screen-footer screen-only">
                    <span>Parkhill Field Observation Report · Date Issued: {issuedLabel}</span>
                    <b>Building Community</b>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </SheetScaler>
  );
}

function Field({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="fld">
      <div className="lb">{label}</div>
      <div className="v" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function PhotoRow({
  row,
  number,
  photoUrl,
}: {
  row: CaReportContent["items"][number]["photos"];
  number: string;
  photoUrl: (photoId: string) => string | null;
}) {
  return (
    <div className="photo-row" data-testid="ca-report-photo-row">
      {row.map((photo) => {
        const url = photoUrl(photo.photoId);
        return (
          <figure key={photo.photoId} className="ph">
            {url ? (
              <div className="photo has">
                {/* eslint-disable-next-line @next/next/no-img-element -- print fidelity */}
                <img src={url} alt={`Item ${number} photo`} />
              </div>
            ) : (
              <div className="photo">Photo not available</div>
            )}
            {photo.caption && <figcaption className="pcap">{photo.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * Shows the Letter-width sheet scaled to fit narrow screens (phones), so the
 * preview looks like the printed page. Printing ignores the scale.
 */
function SheetScaler({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const sheetPx = 8.5 * 96;
    const update = () => setZoom(Math.min(1, el.clientWidth / sheetPx));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} data-print="document" style={{ width: "100%" }}>
      <div className="ca-report-sheet" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}
