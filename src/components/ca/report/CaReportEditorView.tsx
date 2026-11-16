"use client";

import { Box, Button, Dialog, HStack, Portal, Spinner, Stack, Text } from "@chakra-ui/react";
import { CaStateLink } from "@/components/ca/CaStateLink";
import { useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuClock, LuCircleCheck, LuEye, LuFileCheck, LuTrash2 } from "react-icons/lu";

import { CaReportStateBadge } from "@/components/ca/CaReportStateBadge";
import { CaReportEditor } from "@/components/ca/report/CaReportEditor";
import { EmptyState } from "@/components/EmptyState";
import { notifyError, toaster } from "@/components/ui/toaster";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaPhotos } from "@/hooks/ca/useCaPhotos";
import { useCaPins } from "@/hooks/ca/useCaPins";
import { useCaReport } from "@/hooks/ca/useCaReports";
import { caSync } from "@/lib/ca/offline/appSync";
import { deleteLocalDraft, draftHasPendingSync, getLocalDraft } from "@/lib/ca/offline/draftStore";
import { numberPins, pinName } from "@/lib/ca/pins";
import { reportState } from "@/lib/ca/reportContent";
import { formatLongDate } from "@/lib/ca/reportLayout";
import { caNavigate, caProjectPath, caReportPrintPath } from "@/lib/ca/routes";
import { deleteCaReport, issueCaReport } from "@/services/ca/reportService";
import type { CaReportContent } from "@/types/ca";

const SAVE_DELAY_MS = 400;

/**
 * The report editor. Every change is saved on this device within a moment and
 * synced on its own, so the report can be written with no signal. Issuing
 * needs a connection: it freezes the reviewed version as an immutable
 * revision and stamps Date Issued on the server.
 */
export function CaReportEditorView({ reportId }: { reportId: string }) {
  const { projectNumber } = useCaProject();
  const r = useCaReport(projectNumber, reportId);
  const { photos } = useCaPhotos(projectNumber);
  const { pins } = useCaPins(projectNumber);

  const numbers = numberPins(pins);
  const pinNames = new Map(pins.map((p) => [p.id, pinName(p, numbers.get(p.id))]));
  const backHref = caProjectPath(projectNumber, "reports");

  if (r.notFound) {
    return (
      <EmptyState
        icon={<LuFileCheck />}
        title="Report not found"
        description="It may have been deleted, or it was started on another device and has not synced yet."
        action={
          <Button asChild variant="outline" size="lg">
            <CaStateLink href={backHref}>Back to reports</CaStateLink>
          </Button>
        }
      />
    );
  }
  if (!r.loaded || !r.content) {
    return (
      <HStack gap="3" py="8" justify="center">
        <Spinner size="sm" color="brand.solid" />
        <Text color="fg.muted">Loading report…</Text>
      </HStack>
    );
  }

  const state = r.report
    ? r.syncState !== "synced" && r.report.latestRevision !== null
      ? "revising"
      : reportState(r.report)
    : "draft";
  const latestRevision = r.report?.latestRevision ?? null;
  const canIssue = state !== "issued";

  async function issue() {
    if (!navigator.onLine) throw new Error("Issuing needs a connection. Your report is saved on this device.");
    await caSync.syncNow();
    if (await draftHasPendingSync(reportId)) {
      throw new Error("The latest changes have not finished uploading yet. Try again in a moment.");
    }
    const local = await getLocalDraft(reportId);
    const expected = local?.clientUpdatedAt ?? r.version;
    if (!expected) throw new Error("The report has not reached the server yet. Try again in a moment.");
    const result = await issueCaReport(projectNumber, reportId, expected);
    await r.refresh();
    toaster.create({
      type: "success",
      title: `Report ${result.report.reportNumber} issued as Rev ${result.revision.revision}`,
      duration: 4000,
    });
    caNavigate(caReportPrintPath(projectNumber, reportId, result.revision.revision));
  }

  async function remove() {
    if (r.report) {
      if (!navigator.onLine) throw new Error("Deleting a synced report needs a connection.");
      await deleteCaReport(projectNumber, reportId);
    }
    await deleteLocalDraft(reportId);
    caNavigate(backHref);
  }

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Stack gap="3">
        <Button asChild variant="ghost" size="md" alignSelf="flex-start" px="1">
          <CaStateLink href={backHref}>
            <LuArrowLeft /> All reports
          </CaStateLink>
        </Button>
        <HStack gap="3" wrap="wrap">
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="semibold" data-testid="ca-report-title">
            {r.report ? `Report ${r.report.reportNumber}` : "New report"}
          </Text>
          <CaReportStateBadge state={state} latestRevision={latestRevision} />
        </HStack>
        <HStack gap="1.5" fontSize="sm" color={r.syncState === "synced" ? "fg.muted" : "orange.600"} data-testid="ca-report-sync">
          {r.syncState === "synced" ? <LuCircleCheck aria-hidden /> : <LuClock aria-hidden />}
          <Text>
            {r.syncState === "synced"
              ? "All changes saved and synced"
              : r.syncState === "error"
                ? "Saved on this device — upload failed, will retry"
                : "Saved on this device — waiting to upload"}
            {!r.report && " · gets its report number when it first syncs"}
          </Text>
        </HStack>

        <Stack direction={{ base: "column", sm: "row" }} gap="2">
          <Button asChild variant="outline" size="lg">
            <CaStateLink href={caReportPrintPath(projectNumber, reportId)}>
              <LuEye /> Preview / print draft
            </CaStateLink>
          </Button>
          {canIssue && (
            <IssueButton
              label={latestRevision === null ? "Issue report" : `Issue Rev ${latestRevision + 1}`}
              revision={latestRevision === null ? 0 : latestRevision + 1}
              onIssue={issue}
            />
          )}
        </Stack>
        {!canIssue && (
          <Text fontSize="sm" color="fg.muted">
            Rev {latestRevision} is issued and cannot change. Any edit below starts Rev {(latestRevision ?? 0) + 1}.
          </Text>
        )}
      </Stack>

      {r.revisions.length > 0 && (
        <Stack gap="2" borderWidth="1px" borderColor="line" borderRadius="lg" p={{ base: 4, md: 5 }} data-testid="ca-revisions">
          <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="wider">
            Issued revisions
          </Text>
          {r.revisions.map((rev) => (
            <HStack key={rev.id} justify="space-between" gap="3" wrap="wrap">
              <Text>
                <b>Rev {rev.revision}</b> · Issued {formatLongDate(rev.dateIssued)} by {rev.issuedBy}
              </Text>
              <Button asChild variant="outline" size="md">
                <CaStateLink href={caReportPrintPath(projectNumber, reportId, rev.revision)}>View / print Rev {rev.revision}</CaStateLink>
              </Button>
            </HStack>
          ))}
        </Stack>
      )}

      <EditorBody key={reportId} initial={r.content} onSave={r.save} photos={photos} pinNames={pinNames} />

      {latestRevision === null && <DeleteDraft onDelete={remove} />}
    </Stack>
  );
}

/** Keeps typing instant: edits update local state at once and are saved after a short pause. */
function EditorBody({
  initial,
  onSave,
  photos,
  pinNames,
}: {
  initial: CaReportContent;
  onSave: (content: CaReportContent) => Promise<void>;
  photos: Parameters<typeof CaReportEditor>[0]["photos"];
  pinNames: Map<string, string>;
}) {
  const [content, setContent] = useState(initial);
  const pending = useRef<CaReportContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  // Save anything still pending when leaving the page or hiding the app.
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        void saveRef.current(next).catch((error) => notifyError("Could not save the report", error));
      }
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function change(next: CaReportContent) {
    setContent(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const value = pending.current;
      pending.current = null;
      if (value) void saveRef.current(value).catch((error) => notifyError("Could not save the report", error));
    }, SAVE_DELAY_MS);
  }

  return <CaReportEditor content={content} onChange={change} photos={photos} pinNames={pinNames} />;
}

function IssueButton({ label, revision, onIssue }: { label: string; revision: number; onIssue: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <Dialog.Root role="alertdialog" open={open} onOpenChange={(e) => !busy && setOpen(e.open)} placement="center">
      <Dialog.Trigger asChild>
        <Button colorPalette="brand" size="lg">
          <LuFileCheck /> {label}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>Issue Rev {revision}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="2">
                <Text>
                  This freezes the report exactly as it is now, with Date Issued <b>{today}</b>.
                </Text>
                <Text color="fg.muted">
                  An issued revision can never be changed. Later edits become Rev {revision + 1}; Rev {revision} stays
                  as issued.
                </Text>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" size="lg" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                colorPalette="brand"
                size="lg"
                loading={busy}
                loadingText="Issuing…"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onIssue();
                    setOpen(false);
                  } catch (error) {
                    notifyError("Could not issue the report", error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Issue Rev {revision}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function DeleteDraft({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Box pt="2">
      {confirm ? (
        <Stack gap="2" borderWidth="1px" borderColor="border.error" borderRadius="md" p="3">
          <Text>Delete this draft report? This cannot be undone. Its photos stay in the project.</Text>
          <HStack justify="flex-end">
            <Button variant="ghost" size="lg" onClick={() => setConfirm(false)}>
              Keep draft
            </Button>
            <Button
              colorPalette="red"
              size="lg"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                } catch (error) {
                  notifyError("Could not delete the report", error);
                  setBusy(false);
                }
              }}
            >
              Delete draft
            </Button>
          </HStack>
        </Stack>
      ) : (
        <Button variant="ghost" colorPalette="red" size="lg" onClick={() => setConfirm(true)}>
          <LuTrash2 /> Delete draft
        </Button>
      )}
    </Box>
  );
}
