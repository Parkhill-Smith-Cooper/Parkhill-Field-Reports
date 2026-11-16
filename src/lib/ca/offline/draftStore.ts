"use client";

import type { CaReportContent } from "@/types/ca";

import { openCaDb, outboxKey, requestPersistentStorage, type LocalDraft } from "./db";
import { emitCaLocalChange } from "./events";

/**
 * Report drafts on the device. Every edit in the report editor is written here
 * first and queued; the sync engine sends the latest version as an idempotent
 * PUT. A report can therefore be started and written entirely offline - it
 * gets its report number when it first reaches the server.
 */

export async function saveLocalDraft(input: {
  id: string;
  projectNumber: string;
  content: CaReportContent;
  createdAt: string;
}): Promise<LocalDraft> {
  const db = await openCaDb();
  const draft: LocalDraft = {
    id: input.id,
    projectNumber: input.projectNumber,
    content: structuredClone(input.content),
    createdAt: input.createdAt,
    clientUpdatedAt: new Date().toISOString(),
    syncState: "pending",
  };
  const tx = db.transaction(["drafts", "outbox"], "readwrite");
  await tx.objectStore("drafts").put(draft);
  await tx.objectStore("outbox").put({
    key: outboxKey("draft", draft.id),
    kind: "draft",
    entityId: draft.id,
    projectNumber: draft.projectNumber,
    attempts: 0,
    nextAttemptAt: 0,
    blocked: false,
  });
  await tx.done;
  void requestPersistentStorage();
  emitCaLocalChange(draft.projectNumber);
  return draft;
}

export async function getLocalDraft(id: string): Promise<LocalDraft | undefined> {
  return (await openCaDb()).get("drafts", id);
}

export async function listLocalDrafts(projectNumber: string): Promise<LocalDraft[]> {
  return (await openCaDb()).getAllFromIndex("drafts", "byProject", projectNumber);
}

/** Forgets a draft on this device (after it was deleted on the server). */
export async function deleteLocalDraft(id: string): Promise<void> {
  const db = await openCaDb();
  const draft = await db.get("drafts", id);
  const tx = db.transaction(["drafts", "outbox"], "readwrite");
  await tx.objectStore("drafts").delete(id);
  await tx.objectStore("outbox").delete(outboxKey("draft", id));
  await tx.done;
  if (draft) emitCaLocalChange(draft.projectNumber);
}

/** True while this draft has an edit that has not reached the server. */
export async function draftHasPendingSync(id: string): Promise<boolean> {
  return Boolean(await (await openCaDb()).get("outbox", outboxKey("draft", id)));
}
