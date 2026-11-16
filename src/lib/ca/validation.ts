import { isValidGeneratedId, isValidProjectNumber } from "@/lib/validation";
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
  return null;
}
