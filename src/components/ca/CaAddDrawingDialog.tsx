"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Input,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuDownload, LuFileUp } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import {
  DRAWING_ACCEPT,
  isPdf,
  openPdf,
  prepareImageSheet,
  type OpenedPdf,
} from "@/lib/ca/drawingSheet";
import { newCaDrawingId } from "@/lib/ca/ids";
import {
  fetchOfferedDrawingFile,
  fetchOfferedDrawings,
  putCaDrawing,
  type CaDrawingWithUrl,
  type DrawingMeta,
  type OfferedDrawing,
} from "@/services/ca/drawingService";

import { CaSourceTag } from "./CaSourceTag";

type Pending = {
  file: Blob;
  fileName: string;
  title: string;
  sheetNumber: string;
  revisionLabel?: string;
  source: DrawingMeta["source"];
  externalRef?: string;
};

/**
 * Adds a floor plan to the project: upload a PDF or image, or import a sheet
 * from the configured drawing source (mock today; the CA application once
 * Marcelo connects it). Both paths end in the same step: choose the PDF page,
 * confirm the title, and the sheet image is prepared on this device and
 * uploaded. Adding a drawing needs a connection; viewing it afterwards does not.
 */
export function CaAddDrawingDialog({
  projectNumber,
  open,
  onOpenChange,
  onAdded,
}: {
  projectNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (drawing: CaDrawingWithUrl, sheet: Blob) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) setPending(null);
      }}
      size={{ base: "full", md: "lg" }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Add a drawing</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              {open &&
                (pending ? (
                  <PrepareStep
                    key={pending.fileName}
                    projectNumber={projectNumber}
                    pending={pending}
                    onBack={() => setPending(null)}
                    onAdded={(drawing, sheet) => {
                      onAdded(drawing, sheet);
                      setPending(null);
                      onOpenChange(false);
                    }}
                  />
                ) : (
                  <ChooseStep projectNumber={projectNumber} onChosen={setPending} />
                ))}
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="lg" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

const titleFromFileName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim();

function ChooseStep({
  projectNumber,
  onChosen,
}: {
  projectNumber: string;
  onChosen: (pending: Pending) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [offered, setOffered] = useState<{ source: "mock" | "ca-app" | null; drawings: OfferedDrawing[] } | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchOfferedDrawings(projectNumber).then(
      (result) => active && setOffered(result),
      (error: unknown) => active && setOfferError(error instanceof Error ? error.message : "Unavailable."),
    );
    return () => {
      active = false;
    };
  }, [projectNumber]);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onChosen({
      file,
      fileName: file.name,
      title: titleFromFileName(file.name),
      sheetNumber: "",
      source: "upload",
    });
  }

  async function importSheet(sheet: OfferedDrawing) {
    if (!offered?.source) return;
    setImporting(sheet.externalRef);
    try {
      const file = await fetchOfferedDrawingFile(projectNumber, sheet.externalRef);
      onChosen({
        file,
        fileName: sheet.fileName,
        title: sheet.title,
        sheetNumber: sheet.sheetNumber ?? "",
        revisionLabel: sheet.revisionLabel,
        source: offered.source,
        externalRef: sheet.externalRef,
      });
    } catch (error) {
      notifyError("Could not get that drawing", error);
    } finally {
      setImporting(null);
    }
  }

  return (
    <Stack gap="6">
      <input ref={input} type="file" accept={DRAWING_ACCEPT} hidden data-testid="ca-drawing-input" onChange={onFile} />
      <Stack gap="2">
        <Button colorPalette="brand" size="xl" minH="64px" onClick={() => input.current?.click()}>
          <LuFileUp /> Upload PDF or image
        </Button>
        <Text fontSize="sm" color="fg.muted">
          A floor plan sheet: PDF (you choose the page), PNG, JPEG or WebP.
        </Text>
      </Stack>

      <Stack gap="3">
        <HStack justify="space-between" wrap="wrap">
          <Text fontWeight="semibold">From the CA application</Text>
          {offered?.source === "mock" && <CaSourceTag source="mock" />}
        </HStack>
        {offerError ? (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Description>{offerError}</Alert.Description>
          </Alert.Root>
        ) : !offered ? (
          <HStack gap="2">
            <Spinner size="sm" />
            <Text color="fg.muted">Checking for drawings…</Text>
          </HStack>
        ) : !offered.source ? (
          <Text color="fg.muted" fontSize="sm">
            No drawing source is connected. Upload the drawing instead.
          </Text>
        ) : offered.drawings.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            The CA application has no drawings for this project.
          </Text>
        ) : (
          <Stack gap="2" data-testid="ca-offered-drawings">
            {offered.drawings.map((sheet) => (
              <HStack
                key={sheet.externalRef}
                justify="space-between"
                gap="3"
                borderWidth="1px"
                borderColor="line"
                borderRadius="md"
                p="3"
              >
                <Box minW="0">
                  <Text fontWeight="medium">
                    {[sheet.sheetNumber, sheet.title].filter(Boolean).join(" · ")}
                  </Text>
                  <HStack gap="2" mt="1" wrap="wrap">
                    {sheet.revisionLabel && (
                      <Badge variant="outline" size="sm">
                        {sheet.revisionLabel}
                      </Badge>
                    )}
                    {sheet.isLatestApproved && (
                      <Text fontSize="xs" color="fg.muted">
                        Latest approved (per source)
                      </Text>
                    )}
                  </HStack>
                </Box>
                <Button
                  size="lg"
                  variant="outline"
                  flexShrink="0"
                  disabled={sheet.imported}
                  loading={importing === sheet.externalRef}
                  onClick={() => importSheet(sheet)}
                >
                  {sheet.imported ? "Added" : (
                    <>
                      <LuDownload /> Import
                    </>
                  )}
                </Button>
              </HStack>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

function PrepareStep({
  projectNumber,
  pending,
  onBack,
  onAdded,
}: {
  projectNumber: string;
  pending: Pending;
  onBack: () => void;
  onAdded: (drawing: CaDrawingWithUrl, sheet: Blob) => void;
}) {
  const pdf = isPdf(pending.file, pending.fileName);
  const [doc, setDoc] = useState<OpenedPdf | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState(pending.title);
  const [sheetNumber, setSheetNumber] = useState(pending.sheetNumber);
  const [saving, setSaving] = useState(false);

  // Open the PDF once; close it when this step goes away.
  useEffect(() => {
    if (!pdf) return;
    let opened: OpenedPdf | null = null;
    let active = true;
    openPdf(pending.file).then(
      (d) => {
        opened = d;
        if (active) setDoc(d);
        else void d.close();
      },
      (error: unknown) => active && setLoadError(error instanceof Error ? error.message : "That PDF could not be read."),
    );
    return () => {
      active = false;
      void opened?.close();
    };
  }, [pdf, pending.file]);

  // Preview: the chosen PDF page, or the image itself.
  useEffect(() => {
    let url: string | null = null;
    let active = true;
    const make = pdf ? doc?.preview(page) : Promise.resolve(URL.createObjectURL(pending.file));
    make?.then(
      (u) => {
        url = u;
        if (active) setPreview(u);
        else URL.revokeObjectURL(u);
      },
      () => active && setPreview(null),
    );
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdf, doc, page, pending.file]);

  async function save() {
    if (!navigator.onLine) {
      toaster.create({ type: "error", title: "Adding a drawing needs a connection", description: "Try again when you have signal." });
      return;
    }
    setSaving(true);
    try {
      const sheet = pdf && doc ? await doc.renderSheet(page) : await prepareImageSheet(pending.file);
      const meta: DrawingMeta = {
        title: title.trim(),
        ...(sheetNumber.trim() ? { sheetNumber: sheetNumber.trim() } : {}),
        ...(pending.revisionLabel ? { revisionLabel: pending.revisionLabel } : {}),
        originalFileName: pending.fileName,
        fileType: pdf ? "pdf" : "image",
        page: pdf ? page : 1,
        pageCount: pdf && doc ? doc.pageCount : 1,
        width: sheet.width,
        height: sheet.height,
        source: pending.source,
        ...(pending.externalRef ? { externalRef: pending.externalRef } : {}),
      };
      const drawing = await putCaDrawing(projectNumber, newCaDrawingId(), meta, sheet.blob);
      onAdded(drawing, sheet.blob);
    } catch (error) {
      notifyError("Could not add the drawing", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="4">
      <Text fontSize="sm" color="fg.muted" wordBreak="break-all">
        {pending.fileName}
      </Text>

      {loadError && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Description>{loadError}</Alert.Description>
        </Alert.Root>
      )}

      {pdf && doc && (
        <FormField label="Page" helperText={`This PDF has ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}. Choose the floor plan.`}>
          <NativeSelect.Root size="lg">
            <NativeSelect.Field
              aria-label="Page"
              value={page}
              onChange={(e) => setPage(Number(e.currentTarget.value))}
              data-testid="ca-drawing-page"
            >
              {Array.from({ length: doc.pageCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Page {i + 1}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </FormField>
      )}

      <Box
        borderWidth="1px"
        borderColor="line"
        borderRadius="md"
        bg="gray.100"
        minH="160px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="Drawing preview" style={{ maxHeight: "40dvh", width: "auto", maxWidth: "100%", background: "#fff" }} data-testid="ca-drawing-preview" />
        ) : (
          <Spinner color="brand.solid" />
        )}
      </Box>

      <FormField label="Title" required>
        <Input size="lg" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Level 1 Floor Plan" />
      </FormField>
      <FormField label="Sheet number">
        <Input size="lg" value={sheetNumber} maxLength={60} onChange={(e) => setSheetNumber(e.target.value)} placeholder="e.g. A-101" />
      </FormField>

      <HStack justify="space-between" pt="2">
        <Button variant="outline" size="lg" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button
          colorPalette="brand"
          size="lg"
          onClick={save}
          loading={saving}
          loadingText="Preparing…"
          disabled={!title.trim() || Boolean(loadError) || (pdf && !doc)}
        >
          Add drawing
        </Button>
      </HStack>
    </Stack>
  );
}
