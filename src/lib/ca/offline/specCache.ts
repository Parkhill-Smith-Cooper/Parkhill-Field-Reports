"use client";

import { bySectionRevision } from "@/lib/ca/specSections";
import type { CaSpecSection } from "@/types/ca";

import { openCaDb } from "./db";

/**
 * Read cache of the project's specification sections for offline use: the
 * list (current revisions), plus the PDF of every section opened on this
 * device, so a section looked at once reopens on site with no signal.
 *
 * In Azure mode file URLs are short-lived SAS links the service worker cannot
 * reuse, which is why the bytes are kept here rather than in the HTTP cache.
 * A revision's file never changes, so a stored PDF is valid for as long as its
 * revision is current; when the CA application supersedes it, the next list
 * drops it and its bytes go with it.
 */

export async function listCachedSpecSections(projectNumber: string): Promise<CaSpecSection[]> {
  const db = await openCaDb();
  return (await db.getAllFromIndex("specSections", "byProject", projectNumber))
    .map((c) => c.section)
    .sort(bySectionRevision);
}

/** The ids of the sections whose PDF is on this device. */
export async function cachedSpecFileIds(projectNumber: string): Promise<Set<string>> {
  const db = await openCaDb();
  const rows = await db.getAllFromIndex("specSections", "byProject", projectNumber);
  return new Set(rows.filter((r) => r.blob).map((r) => r.id));
}

/**
 * Replaces the project's cached list with the server's. A PDF already stored
 * for a section still listed is kept; anything no longer listed (superseded,
 * withdrawn) is removed with its bytes.
 */
export async function mirrorSpecSections(projectNumber: string, sections: CaSpecSection[]): Promise<void> {
  const db = await openCaDb();
  const tx = db.transaction("specSections", "readwrite");
  const listed = new Map(sections.map((s) => [s.id, s]));
  const cachedAt = new Date().toISOString();
  for (const key of await tx.store.index("byProject").getAllKeys(projectNumber)) {
    if (!listed.has(key)) await tx.store.delete(key);
  }
  for (const section of sections) {
    const existing = await tx.store.get(section.id);
    await tx.store.put({
      id: section.id,
      projectNumber,
      section,
      blob: existing && existing.section.filePath === section.filePath ? existing.blob : null,
      cachedAt,
    });
  }
  await tx.done;
}

/** The stored PDF of one section, or null. */
export async function cachedSpecFile(sectionId: string): Promise<Blob | null> {
  try {
    const db = await openCaDb();
    return (await db.get("specSections", sectionId))?.blob ?? null;
  } catch {
    return null;
  }
}

/** Keeps a section's PDF on this device. Best effort: a full disk is not an error. */
export async function storeSpecFile(section: CaSpecSection, blob: Blob): Promise<void> {
  try {
    const db = await openCaDb();
    await db.put("specSections", {
      id: section.id,
      projectNumber: section.projectNumber,
      section,
      blob,
      cachedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(`[CA offline] Could not keep specification ${section.id}`, error);
  }
}
