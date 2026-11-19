"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  IconButton,
  Input,
  Menu,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuDownload, LuEllipsisVertical, LuFileUp, LuPencil, LuPlus, LuSearch, LuSparkles } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import type { CaDrawingView } from "@/hooks/ca/useCaDrawings";
import { useCaDrawingSets, type SheetNamingStatus, type UploadProgress } from "@/hooks/ca/useCaDrawingSets";
import { DRAWING_SET_ACCEPT, isPdf, openPdf, prepareImageSheet, type OpenedPdf } from "@/lib/ca/drawingSheet";
import { newCaDrawingId } from "@/lib/ca/ids";
import { MAX_SHEET_NAME, MAX_SHEET_NUMBER, sheetLabel, untitledSheet, type SetSheet } from "@/lib/ca/sheetIndex";
import {
  fetchOfferedDrawingFile,
  fetchOfferedDrawings,
  putCaDrawing,
  type CaDrawingWithUrl,
  type DrawingMeta,
  type OfferedDrawing,
} from "@/services/ca/drawingService";
import type { CaDrawingSetWithUrl } from "@/services/ca/drawingSetService";

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

type SheetSets = ReturnType<typeof useCaDrawingSets>;

/** Show a "find a sheet" box once a list is longer than this. */
const FILTER_FROM = 8;

/**
 * Adds a floor plan to the project by choosing its sheet:
 *
 * - from a drawing-set PDF uploaded to the project. Every page is listed as a
 *   sheet, `<sheet number> - <sheet name>`, read from its title block by AI
 *   and editable by the engineer. Sets and names are stored on the server
 *   (PDF in Blob Storage), so every device sees them. Each sheet added
 *   becomes a drawing (rendered to an image on this device and uploaded);
 * - or from the configured drawing source. A drawing set (a PDF, as the CA
 *   application's Document Control offers its current set) is imported as a
 *   set like the above; a single sheet image (mock) goes through the
 *   page-and-title step below.
 *
 * Adding a drawing needs a connection; viewing it afterwards does not.
 */
export function CaAddDrawingDialog({
  projectNumber,
  drawings,
  open,
  onOpenChange,
  onAdded,
}: {
  projectNumber: string;
  /** The project's drawings, to mark sheets already added. */
  drawings: CaDrawingView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (drawing: CaDrawingWithUrl, sheet: Blob) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Mounted with the page, not the dialog, so AI naming carries on while it is closed.
  const sheetSets = useCaDrawingSets(projectNumber);
  const { refresh: refreshSets } = sheetSets;

  // Sets uploaded or renamed on other devices appear when the dialog opens.
  useEffect(() => {
    if (open) void refreshSets();
  }, [open, refreshSets]);

  const finish = (drawing: CaDrawingWithUrl, sheet: Blob) => {
    onAdded(drawing, sheet);
    setPending(null);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) setPending(null);
      }}
      size={{ base: "full", md: "lg" }}
      placement="center"
      scrollBehavior="inside"
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
                    onAdded={finish}
                  />
                ) : (
                  <ChooseStep
                    projectNumber={projectNumber}
                    drawings={drawings}
                    sheetSets={sheetSets}
                    onChosen={setPending}
                    onAdded={finish}
                  />
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

/** Pages of the set that have already been added as drawings. */
function addedPages(set: CaDrawingSetWithUrl, drawings: CaDrawingView[]): Set<number> {
  return new Set(drawings.filter((d) => d.drawingSetId === set.id).map((d) => d.page));
}

function ChooseStep({
  projectNumber,
  drawings,
  sheetSets,
  onChosen,
  onAdded,
}: {
  projectNumber: string;
  drawings: CaDrawingView[];
  sheetSets: SheetSets;
  onChosen: (pending: Pending) => void;
  onAdded: (drawing: CaDrawingWithUrl, sheet: Blob) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<SetProgress | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
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

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isPdf(file, file.name)) {
      toaster.create({ type: "error", title: "Upload a PDF", description: "Drawing sets are uploaded as PDF files." });
      return;
    }
    if (!navigator.onLine) {
      toaster.create({ type: "error", title: "Uploading a drawing set needs a connection", description: "Try again when you have signal." });
      return;
    }
    setProgress("opening");
    try {
      await sheetSets.upload(file, setProgress);
    } catch (error) {
      notifyError("The drawing set could not be uploaded", error);
    } finally {
      setProgress(null);
    }
  }

  async function addSetSheet(set: CaDrawingSetWithUrl, sheet: SetSheet) {
    if (!navigator.onLine) {
      toaster.create({ type: "error", title: "Adding a drawing needs a connection", description: "Try again when you have signal." });
      return;
    }
    setAdding(`${set.id}:${sheet.page}`);
    try {
      const rendered = await sheetSets.renderSheet(set.id, sheet.page);
      const meta: DrawingMeta = {
        title: sheet.sheetName.trim() || untitledSheet(sheet.page),
        ...(sheet.sheetNumber.trim() ? { sheetNumber: sheet.sheetNumber.trim() } : {}),
        originalFileName: set.fileName,
        fileType: "pdf",
        page: sheet.page,
        pageCount: set.pageCount,
        width: rendered.width,
        height: rendered.height,
        source: "upload",
        drawingSetId: set.id,
      };
      const drawing = await putCaDrawing(projectNumber, newCaDrawingId(), meta, rendered.blob);
      onAdded(drawing, rendered.blob);
    } catch (error) {
      notifyError("Could not add the drawing", error);
    } finally {
      setAdding(null);
    }
  }

  async function importSheet(sheet: OfferedDrawing) {
    if (!offered?.source) return;
    if (sheet.fileType === "pdf") return importSet(offered.source, sheet);
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

  /**
   * A drawing set (one PDF) from the source: downloaded to this device, then
   * stored exactly like an uploaded set (pages listed as sheets, named by AI),
   * remembering which version it was, so it is offered as "Added" afterwards.
   */
  async function importSet(source: "mock" | "ca-app", sheet: OfferedDrawing) {
    if (!navigator.onLine) {
      toaster.create({ type: "error", title: "Importing a drawing set needs a connection", description: "Try again when you have signal." });
      return;
    }
    setImporting(sheet.externalRef);
    setProgress("downloading");
    try {
      const blob = await fetchOfferedDrawingFile(projectNumber, sheet.externalRef);
      const file = new File([blob], sheet.fileName, { type: "application/pdf" });
      setProgress("opening");
      await sheetSets.upload(file, setProgress, {
        source,
        externalRef: sheet.externalRef,
        ...(sheet.revisionLabel ? { revisionLabel: sheet.revisionLabel } : {}),
      });
      setOffered((current) =>
        current && {
          ...current,
          drawings: current.drawings.map((d) => (d.externalRef === sheet.externalRef ? { ...d, imported: true } : d)),
        },
      );
    } catch (error) {
      notifyError("The drawing set could not be imported", error);
    } finally {
      setImporting(null);
      setProgress(null);
    }
  }

  return (
    <Stack gap="6">
      <input ref={input} type="file" accept={DRAWING_SET_ACCEPT} hidden data-testid="ca-drawing-input" onChange={onFile} />
      <Stack gap="2">
        <Button
          colorPalette="brand"
          size="xl"
          minH="64px"
          onClick={() => input.current?.click()}
          loading={Boolean(progress) && !importing}
          disabled={Boolean(importing)}
          loadingText={progressText(progress)}
        >
          <LuFileUp /> Upload PDF drawing set
        </Button>
        <Text fontSize="sm" color="fg.muted">
          The project&apos;s drawing set as one PDF. Every page is listed as a sheet, named from its title block, for you
          to choose the floor plan you are on. The set is saved to the project, so it is on every device.
        </Text>
      </Stack>

      {sheetSets.loadError && sheetSets.sets.length === 0 && (
        <Alert.Root status="warning" data-testid="ca-sets-error">
          <Alert.Indicator />
          <Alert.Description>The project&apos;s drawing sets could not be loaded. {sheetSets.loadError}</Alert.Description>
        </Alert.Root>
      )}

      {sheetSets.sets.map((set) => (
        <SheetSetSection
          key={set.id}
          set={set}
          status={sheetSets.naming[set.id]}
          added={addedPages(set, drawings)}
          adding={adding?.startsWith(`${set.id}:`) ? Number(adding.split(":")[1]) : null}
          busy={adding !== null}
          thumbnail={(page) => sheetSets.thumbnail(set.id, page)}
          onAdd={(sheet) => void addSetSheet(set, sheet)}
          onEdit={(page, patch) => sheetSets.editSheet(set.id, page, patch)}
          onRename={() => void sheetSets.nameSheets(set)}
          onRemove={() =>
            void sheetSets.removeSet(set.id).catch((error: unknown) => notifyError("Could not remove the drawing set", error))
          }
        />
      ))}

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
            No drawing source is connected. Upload the drawing set instead.
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
                    {sheet.fileType === "pdf"
                      ? `Drawing set: ${sheet.title}`
                      : sheetLabel({ sheetNumber: sheet.sheetNumber, sheetName: sheet.title })}
                  </Text>
                  {sheet.fileType === "pdf" && (
                    <Text fontSize="sm" color="fg.muted" wordBreak="break-all">
                      {sheet.fileName}
                      {sheet.sizeBytes ? ` · ${formatMegabytes(sheet.sizeBytes)}` : ""}
                    </Text>
                  )}
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
                  disabled={sheet.imported || (importing !== null && importing !== sheet.externalRef) || Boolean(progress && !importing)}
                  loading={importing === sheet.externalRef}
                  loadingText={sheet.fileType === "pdf" ? progressText(progress) : undefined}
                  aria-label={sheet.imported ? undefined : `Import ${sheet.fileType === "pdf" ? "drawing set " : ""}${sheet.title}`}
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

type SetProgress = UploadProgress | "downloading" | "opening";

const formatMegabytes = (bytes: number) => `${Math.max(0.1, Math.round(bytes / 104_857.6) / 10)} MB`;

function progressText(progress: SetProgress | null): string {
  if (progress === "downloading") return "Downloading the set…";
  if (!progress || progress === "opening") return "Opening the PDF…";
  if (progress.phase === "reading") return `Reading sheets… ${progress.done} of ${progress.total}`;
  return `Uploading… ${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`;
}

function NamingLine({ status, onRename, canRename }: { status?: SheetNamingStatus; onRename: () => void; canRename: boolean }) {
  if (status?.state === "running") {
    return (
      <HStack gap="2" fontSize="sm" color="fg.muted" data-testid="ca-set-naming">
        <Spinner size="xs" />
        <Text>
          Naming sheets from their title blocks… {status.done} of {status.total}
        </Text>
      </HStack>
    );
  }
  if (status) {
    return (
      <Alert.Root status={status.state === "unavailable" ? "info" : "warning"} size="sm" data-testid="ca-set-naming">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            {status.message} {status.state === "failed" && "Check the names below, or try again."}
          </Alert.Description>
        </Alert.Content>
        {status.state === "failed" && canRename && (
          <Button size="sm" variant="outline" onClick={onRename} alignSelf="center">
            Try again
          </Button>
        )}
      </Alert.Root>
    );
  }
  if (!canRename) return null;
  return (
    <Button size="sm" variant="outline" alignSelf="flex-start" onClick={onRename}>
      <LuSparkles /> Name sheets with AI
    </Button>
  );
}

function SheetSetSection({
  set,
  status,
  added,
  adding,
  busy,
  thumbnail,
  onAdd,
  onEdit,
  onRename,
  onRemove,
}: {
  set: CaDrawingSetWithUrl;
  status?: SheetNamingStatus;
  added: Set<number>;
  adding: number | null;
  busy: boolean;
  thumbnail: (page: number) => Promise<string>;
  onAdd: (sheet: SetSheet) => void;
  onEdit: (page: number, patch: { sheetNumber: string; sheetName: string }) => Promise<void>;
  onRename: () => void;
  onRemove: () => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const shown = query
    ? set.sheets.filter((s) => `${sheetLabel(s)} ${untitledSheet(s.page)}`.toLowerCase().includes(query))
    : set.sheets;
  const unnamed = set.sheets.some((s) => s.naming === "guess");

  return (
    <Stack gap="3" data-testid="ca-sheet-set">
      <HStack justify="space-between" gap="2" align="flex-start">
        <Box minW="0">
          <HStack gap="2" wrap="wrap">
            <Text fontWeight="semibold">{set.source ? "Drawing set from the CA application" : "Uploaded drawing set"}</Text>
            {set.source === "mock" && <CaSourceTag source="mock" />}
            {set.revisionLabel && (
              <Badge variant="outline" size="sm" data-testid="ca-set-revision">
                {set.revisionLabel}
              </Badge>
            )}
          </HStack>
          <Text fontSize="sm" color="fg.muted" wordBreak="break-all">
            {set.fileName} · {set.pageCount} sheet{set.pageCount === 1 ? "" : "s"}
          </Text>
        </Box>
        <Menu.Root>
          <Menu.Trigger asChild>
            <IconButton aria-label="Drawing set options" variant="ghost" size="md">
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item value="remove" color="fg.error" onClick={onRemove}>
                  Remove set from the project
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>

      <NamingLine status={status} onRename={onRename} canRename={unnamed} />

      {set.sheets.length > FILTER_FROM && (
        <Box position="relative">
          <Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
            <LuSearch aria-hidden />
          </Box>
          <Input
            size="lg"
            ps="10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a sheet, e.g. A-101 or floor plan"
            aria-label="Find a sheet"
          />
        </Box>
      )}

      <Stack gap="2" data-testid="ca-set-sheets">
        {shown.map((sheet) => (
          <SetSheetRow
            key={sheet.page}
            sheet={sheet}
            naming={status?.state === "running" && sheet.naming === "guess"}
            added={added.has(sheet.page)}
            adding={adding === sheet.page}
            disabled={busy}
            thumbnail={() => thumbnail(sheet.page)}
            onAdd={() => onAdd(sheet)}
            onSave={(patch) => onEdit(sheet.page, patch)}
          />
        ))}
        {shown.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            No sheet matches &ldquo;{filter.trim()}&rdquo;.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function SetSheetRow({
  sheet,
  naming,
  added,
  adding,
  disabled,
  thumbnail,
  onAdd,
  onSave,
}: {
  sheet: SetSheet;
  naming: boolean;
  added: boolean;
  adding: boolean;
  disabled: boolean;
  thumbnail: () => Promise<string>;
  onAdd: () => void;
  onSave: (patch: { sheetNumber: string; sheetName: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [sheetNumber, setSheetNumber] = useState(sheet.sheetNumber);
  const [sheetName, setSheetName] = useState(sheet.sheetName);
  const [saving, setSaving] = useState(false);
  const label = sheetLabel(sheet);

  function startEditing() {
    setSheetNumber(sheet.sheetNumber);
    setSheetName(sheet.sheetName);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ sheetNumber, sheetName });
      setEditing(false);
    } catch (error) {
      notifyError("Could not save the sheet name", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box borderWidth="1px" borderColor="line" borderRadius="md" p="3" data-testid="ca-set-sheet" data-page={sheet.page}>
      <HStack gap="3" align="center" wrap="wrap">
        <SheetThumbnail load={thumbnail} />
        <Box minW="0" flex="1 1 11rem">
          <Text fontWeight="medium" data-testid="ca-set-sheet-label" color={label ? undefined : "fg.muted"}>
            {label || untitledSheet(sheet.page)}
          </Text>
          <HStack gap="2" mt="1" wrap="wrap" fontSize="xs" color="fg.muted">
            <Text>Page {sheet.page}</Text>
            {naming ? (
              <HStack gap="1">
                <Spinner size="xs" />
                <Text>Naming…</Text>
              </HStack>
            ) : sheet.naming === "ai" ? (
              <Badge size="sm" variant="subtle" colorPalette="purple" title="Read from the title block by AI. Check it, and edit if wrong.">
                <LuSparkles aria-hidden /> AI
              </Badge>
            ) : sheet.naming === "guess" && !sheet.sheetName ? (
              <Text>Not named yet</Text>
            ) : null}
          </HStack>
        </Box>
        <HStack gap="2" ms="auto" flexShrink="0">
          {!editing && (
            <IconButton aria-label={`Edit name of ${label || untitledSheet(sheet.page)}`} variant="ghost" size="lg" onClick={startEditing}>
              <LuPencil />
            </IconButton>
          )}
          <Button
            size="lg"
            variant="outline"
            flexShrink="0"
            disabled={added || (disabled && !adding)}
            loading={adding}
            loadingText="Adding…"
            onClick={onAdd}
          >
            {added ? "Added" : (
              <>
                <LuPlus /> Add
              </>
            )}
          </Button>
        </HStack>
      </HStack>

      {editing && (
        <Stack
          as="form"
          gap="3"
          mt="3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            void save();
          }}
        >
          <HStack gap="3" align="flex-start" wrap={{ base: "wrap", sm: "nowrap" }}>
            <Box flex={{ base: "1 1 100%", sm: "0 0 9rem" }}>
              <FormField label="Sheet number">
                <Input size="lg" value={sheetNumber} maxLength={MAX_SHEET_NUMBER} onChange={(e) => setSheetNumber(e.target.value)} placeholder="e.g. A-101" />
              </FormField>
            </Box>
            <Box flex="1 1 auto" minW="0">
              <FormField label="Sheet name">
                <Input size="lg" value={sheetName} maxLength={MAX_SHEET_NAME} onChange={(e) => setSheetName(e.target.value)} placeholder="e.g. Level 1 Floor Plan" />
              </FormField>
            </Box>
          </HStack>
          <HStack justify="flex-end" gap="2">
            <Button variant="outline" size="lg" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" colorPalette="brand" size="lg" loading={saving}>
              Save name
            </Button>
          </HStack>
        </Stack>
      )}
    </Box>
  );
}

/** A small preview of the sheet, rendered only once it scrolls into view. */
function SheetThumbnail({ load }: { load: () => Promise<string> }) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let active = true;
    let made: string | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      loadRef.current().then(
        (u) => {
          made = u;
          if (active) setUrl(u);
          else URL.revokeObjectURL(u);
        },
        () => undefined,
      );
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
      if (made) URL.revokeObjectURL(made);
    };
  }, []);

  return (
    <Box
      ref={box}
      w="64px"
      h="48px"
      flexShrink="0"
      borderWidth="1px"
      borderColor="line"
      borderRadius="sm"
      bg="white"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      ) : (
        <Spinner size="xs" color="fg.muted" />
      )}
    </Box>
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
