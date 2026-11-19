import { isValidGeneratedId, isValidProjectNumber } from "@/lib/validation";
import {
  MAX_IMAGE_CHARS,
  MAX_LINE_LENGTH,
  MAX_LINES_PER_PAGE,
  MAX_PAGES_PER_REQUEST,
  MAX_SET_BLOCKS,
  MAX_SET_PAGES,
  MAX_SHEET_NAME,
  MAX_SHEET_NUMBER,
} from "@/lib/ca/sheetIndex";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/ca/reportLocations";
import { CA_ITEM_STATUSES, type CaReportContent } from "@/types/ca";

/**
 * Edge validation for CA request bodies. Each validator returns `null` when
 * the value is acceptable, otherwise a message suitable for a 400 response.
 *
 * Reuses the CX project-number and generated-id rules, because a CA project
 * number is also a document id, a partition key and a file-path segment.
 */

const MAX_TEXT = 10_000;
const MAX_SHORT = 300;
const MAX_ITEMS = 500;
const MAX_PHOTOS_PER_ITEM = 200;
const MAX_PERSONS = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = MAX_TEXT): v is string =>
  typeof v === "string" && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isIsoDateTime = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

export function validateNewCaProject(body: unknown): string | null {
  if (!isObj(body)) return "Request body must be an object.";
  if (!isValidProjectNumber(body.projectNumber)) {
    return "Invalid project number. Use letters, numbers, dots, dashes or underscores.";
  }
  if (!isStr(body.name, 200) || body.name.trim().length === 0) {
    return "Project name is required (200 characters or fewer).";
  }
  if (body.client !== undefined && !isStr(body.client, MAX_SHORT)) {
    return "Client must be 300 characters or fewer.";
  }
  if (!["ca-app", "vantagepoint", "manual", "mock"].includes(body.source as string)) {
    return "Invalid project source.";
  }
  if (body.externalRef !== undefined && !isStr(body.externalRef, MAX_SHORT)) {
    return "Invalid external reference.";
  }
  return null;
}

export function validatePhotoMeta(body: unknown): string | null {
  if (!isObj(body)) return "Photo metadata must be an object.";
  if (!isStr(body.caption, 1000)) return "Caption must be 1,000 characters or fewer.";
  if (!isStr(body.fileName, 200) || body.fileName.trim().length === 0) {
    return "File name is required.";
  }
  if (!isIsoDateTime(body.takenAt)) return "Invalid photo time.";
  if (!isIsoDateTime(body.clientUpdatedAt)) return "Invalid edit time.";
  if (body.pinId !== undefined && body.pinId !== null && !isValidGeneratedId(body.pinId)) {
    return "Invalid pin id.";
  }
  if (body.reportId !== undefined && body.reportId !== null && !isValidGeneratedId(body.reportId)) {
    return "Invalid report id.";
  }
  if (body.deleted !== undefined && !isBool(body.deleted)) return "Invalid photo state.";
  for (const key of ["width", "height"] as const) {
    if (body[key] !== undefined && !(Number.isInteger(body[key]) && (body[key] as number) > 0)) {
      return `Invalid photo ${key}.`;
    }
  }
  return null;
}

export function validatePin(body: unknown): string | null {
  if (!isObj(body)) return "Pin must be an object.";
  if (!isValidGeneratedId(body.drawingId)) return "Invalid drawing id.";
  for (const key of ["x", "y"] as const) {
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      return `Pin ${key} must be between 0 and 1.`;
    }
  }
  if (!isStr(body.label, 120)) return "Pin label must be 120 characters or fewer.";
  if (!isStr(body.note, 2000)) return "Pin note must be 2,000 characters or fewer.";
  if (!isIsoDateTime(body.createdAt) || !isIsoDateTime(body.clientUpdatedAt)) {
    return "Invalid pin timestamps.";
  }
  if (body.deleted !== undefined && !isBool(body.deleted)) return "Invalid pin state.";
  return null;
}

/** Sheet image types the server stores. PDFs and SVGs are rendered on the device first. */
export const CA_DRAWING_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export const CA_DRAWING_MAX_BYTES = 25 * 1024 * 1024;

/** Metadata sent with a drawing upload (the sheet image travels as the file). */
export function validateDrawingMeta(body: unknown): string | null {
  if (!isObj(body)) return "Drawing details must be an object.";
  if (!isStr(body.title, 200) || body.title.trim().length === 0) {
    return "A drawing title is required (200 characters or fewer).";
  }
  for (const key of ["sheetNumber", "revisionLabel"] as const) {
    if (body[key] !== undefined && !isStr(body[key], 60)) return `Invalid ${key}.`;
  }
  if (!isStr(body.originalFileName, 260) || body.originalFileName.trim().length === 0) {
    return "The original file name is required.";
  }
  if (body.fileType !== "pdf" && body.fileType !== "image") return "Invalid drawing file type.";
  for (const key of ["page", "pageCount", "width", "height"] as const) {
    const v = body[key];
    if (!(Number.isInteger(v) && (v as number) > 0 && (v as number) <= 100_000)) {
      return `Invalid drawing ${key}.`;
    }
  }
  if ((body.page as number) > (body.pageCount as number)) return "The page is outside the document.";
  if (!["upload", "ca-app", "mock"].includes(body.source as string)) return "Invalid drawing source.";
  if (body.source !== "upload" && !isStr(body.externalRef, MAX_SHORT)) {
    return "An imported drawing needs its source reference.";
  }
  if (body.drawingSetId !== undefined) {
    // A sheet of a set uploaded by hand ("upload") or synced from the source.
    if (body.fileType !== "pdf" || !isValidGeneratedId(body.drawingSetId)) {
      return "Invalid drawing set.";
    }
  }
  return null;
}

const isSheetText = (v: unknown, max: number): v is string => isStr(v, max);

/** Body of `PUT .../drawing-sets/{setId}`: commits the uploaded blocks as the set. */
export function validateDrawingSetCommit(body: unknown): string | null {
  if (!isObj(body)) return "Drawing set details must be an object.";
  if (!isStr(body.fileName, 260) || body.fileName.trim().length === 0) return "The file name is required.";
  if (!/\.pdf$/i.test(body.fileName.trim())) return "Drawing sets must be PDF files.";
  const blocks = body.blockCount;
  if (!(Number.isInteger(blocks) && (blocks as number) > 0 && (blocks as number) <= MAX_SET_BLOCKS)) {
    return "Invalid upload.";
  }
  const pages = body.pageCount;
  if (!(Number.isInteger(pages) && (pages as number) > 0 && (pages as number) <= MAX_SET_PAGES)) {
    return `Drawing sets can have up to ${MAX_SET_PAGES} pages.`;
  }
  const sheetProblem = validateSheets(body.sheets, pages as number);
  if (sheetProblem) return sheetProblem;
  // Optional: where an imported set came from. All or nothing.
  if (body.source !== undefined || body.externalRef !== undefined || body.revisionLabel !== undefined) {
    if (body.source !== "mock" && body.source !== "ca-app") return "Invalid drawing source.";
    if (!isStr(body.externalRef, 300) || body.externalRef.trim().length === 0) return "Invalid drawing reference.";
    if (body.revisionLabel !== undefined && !isStr(body.revisionLabel, 120)) return "Invalid revision label.";
  }
  return null;
}

/**
 * Body of the CA application's push, `POST /api/ca/integrations/ccr/drawing-sets`.
 * Only ids: the file is then fetched from the CA application's read route.
 */
export function validateDrawingSyncPush(body: unknown): string | null {
  if (!isObj(body)) return "Request body must be an object.";
  if (!isValidProjectNumber(body.projectNumber)) return "Invalid project number.";
  if (body.versionId !== undefined && (!isStr(body.versionId, MAX_SHORT) || body.versionId.trim().length === 0)) {
    return "Invalid version id.";
  }
  if (!["published", "updated", "removed"].includes(body.event as string)) return "Invalid event.";
  return null;
}

/**
 * Body of `PUT .../drawing-sets/{setId}/index`: a synced set's pages, listed
 * as sheets by the first device to open it.
 */
export function validateDrawingSetIndex(body: unknown): string | null {
  if (!isObj(body)) return "Request body must be an object.";
  const pages = body.pageCount;
  if (!(Number.isInteger(pages) && (pages as number) > 0 && (pages as number) <= MAX_SET_PAGES)) {
    return `Drawing sets can have up to ${MAX_SET_PAGES} pages.`;
  }
  return validateSheets(body.sheets, pages as number);
}

function validateSheets(sheets: unknown, pages: number): string | null {
  if (!Array.isArray(sheets) || sheets.length !== pages) return "Include one sheet per page.";
  for (const [i, sheet] of sheets.entries()) {
    if (
      !isObj(sheet) ||
      sheet.page !== i + 1 ||
      !isSheetText(sheet.sheetNumber, MAX_SHEET_NUMBER) ||
      !isSheetText(sheet.sheetName, MAX_SHEET_NAME) ||
      !["guess", "ai", "edited"].includes(sheet.naming as string)
    ) {
      return "Invalid sheet.";
    }
  }
  return null;
}

/** Body of `PATCH .../drawing-sets/{setId}`: an engineer's correction of one sheet. */
export function validateSetSheetEdit(body: unknown): string | null {
  if (!isObj(body)) return "Request body must be an object.";
  if (!(Number.isInteger(body.page) && (body.page as number) > 0 && (body.page as number) <= MAX_SET_PAGES)) {
    return "Invalid page.";
  }
  if (!isSheetText(body.sheetNumber, MAX_SHEET_NUMBER)) return `Sheet numbers are ${MAX_SHEET_NUMBER} characters or fewer.`;
  if (!isSheetText(body.sheetName, MAX_SHEET_NAME)) return `Sheet names are ${MAX_SHEET_NAME} characters or fewer.`;
  return null;
}

export function validateReportContent(value: unknown): string | null {
  if (!isObj(value)) return "Report content must be an object.";
  const c = value as Partial<Record<keyof CaReportContent, unknown>>;

  for (const key of [
    "to",
    "from",
    "projectName",
    "projectNo",
    "percentComplete",
    "temperature",
  ] as const) {
    if (!isStr(c[key], MAX_SHORT)) return `Field "${key}" must be short text.`;
  }
  for (const key of [
    "materialsStored",
    "clientActionItems",
    "workSummary",
    "comments",
  ] as const) {
    if (!isStr(c[key])) return `Field "${key}" is too long.`;
  }
  if (!(c.dateVisited === "" || (typeof c.dateVisited === "string" && ISO_DATE.test(c.dateVisited)))) {
    return "Date Visited must be yyyy-mm-dd.";
  }
  if (!(c.timeVisited === "" || (typeof c.timeVisited === "string" && TIME.test(c.timeVisited)))) {
    return "Time must be HH:mm.";
  }
  if (c.coverPhotoId !== undefined && c.coverPhotoId !== null && !isValidGeneratedId(c.coverPhotoId)) {
    return "Invalid cover photo.";
  }

  const weather = c.weather;
  if (
    !isObj(weather) ||
    !["clear", "overcast", "rain", "snow", "foggy", "cold"].every((k) => isBool(weather[k]))
  ) {
    return "Invalid weather selection.";
  }
  const site = c.site;
  if (
    !isObj(site) ||
    !["clear", "dusty", "muddy"].every((k) => isBool(site[k])) ||
    !isStr(site.other, MAX_SHORT)
  ) {
    return "Invalid site conditions.";
  }
  const dist = c.distribution;
  if (!isObj(dist) || !["owner", "parkhill", "contractor"].every((k) => isBool(dist[k]))) {
    return "Invalid distribution.";
  }

  if (!Array.isArray(c.persons) || c.persons.length > MAX_PERSONS) {
    return "Invalid persons list.";
  }
  for (const person of c.persons) {
    if (
      !isObj(person) ||
      !isStr(person.name, MAX_SHORT) ||
      !isStr(person.company, MAX_SHORT) ||
      !isStr(person.email, MAX_SHORT)
    ) {
      return "Each person needs a name, company and email (short text).";
    }
  }

  if (!Array.isArray(c.items) || c.items.length > MAX_ITEMS) {
    return "Invalid observation items.";
  }
  for (const item of c.items) {
    if (!isObj(item) || !isValidGeneratedId(item.id)) return "Invalid observation item.";
    if (!(CA_ITEM_STATUSES as readonly string[]).includes(item.status as string)) {
      return "Invalid observation status.";
    }
    if (!isStr(item.description)) return "Observation description is too long.";
    if (item.pinId !== undefined && item.pinId !== null && !isValidGeneratedId(item.pinId)) {
      return "Invalid observation pin.";
    }
    if (!Array.isArray(item.photos) || item.photos.length > MAX_PHOTOS_PER_ITEM) {
      return "Invalid observation photos.";
    }
    for (const photo of item.photos) {
      if (!isObj(photo) || !isValidGeneratedId(photo.photoId) || !isStr(photo.caption, 1000)) {
        return "Invalid observation photo.";
      }
    }
  }

  if (c.locationZoom !== undefined && c.locationZoom !== null) {
    const zoom = c.locationZoom;
    if (!isObj(zoom) || Object.keys(zoom).length > MAX_ITEMS * 2) return "Invalid floor plan zoom.";
    for (const [pinId, level] of Object.entries(zoom)) {
      if (!isValidGeneratedId(pinId) || typeof level !== "number" || !(level >= MIN_ZOOM && level <= MAX_ZOOM)) {
        return "Invalid floor plan zoom.";
      }
    }
  }

  if (c.drawingSet !== undefined) {
    const set = c.drawingSet;
    if (
      !isObj(set) ||
      !isValidGeneratedId(set.setId) ||
      (set.revisionLabel !== undefined && !isStr(set.revisionLabel, 120)) ||
      (set.title !== undefined && !isStr(set.title, MAX_SHORT))
    ) {
      return "Invalid drawing set.";
    }
  }
  return null;
}

/** Body of `POST .../sheet-names`: title-block text (or an image) for each page. */
export function validateSheetNameRequest(body: unknown): string | null {
  if (!isObj(body) || !Array.isArray(body.pages)) return "Include the pages to name.";
  if (body.pages.length === 0 || body.pages.length > MAX_PAGES_PER_REQUEST) {
    return `Send 1 to ${MAX_PAGES_PER_REQUEST} pages at a time.`;
  }
  const seen = new Set<number>();
  for (const page of body.pages) {
    if (!isObj(page)) return "Invalid page.";
    if (!(Number.isInteger(page.page) && (page.page as number) > 0 && (page.page as number) <= 100_000)) {
      return "Invalid page number.";
    }
    if (seen.has(page.page as number)) return "Each page may be sent once.";
    seen.add(page.page as number);
    if (
      !Array.isArray(page.lines) ||
      page.lines.length > MAX_LINES_PER_PAGE ||
      !page.lines.every((line) => isStr(line, MAX_LINE_LENGTH + 10))
    ) {
      return "Invalid title-block text.";
    }
    if (page.image !== undefined) {
      if (!isStr(page.image, MAX_IMAGE_CHARS) || !page.image.startsWith("data:image/jpeg;base64,")) {
        return "Title-block images must be JPEG data URLs.";
      }
    }
    if (page.lines.length === 0 && page.image === undefined) return "Each page needs text or an image.";
  }
  return null;
}
