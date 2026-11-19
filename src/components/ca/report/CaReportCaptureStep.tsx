"use client";

import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuArrowRight, LuCloudDownload, LuCloudOff, LuImages, LuMap, LuMapPin, LuPlus, LuX } from "react-icons/lu";

import { CaAddDrawingDialog } from "@/components/ca/CaAddDrawingDialog";
import { CaCaptureBar } from "@/components/ca/CaCaptureBar";
import { CaDrawingPicker } from "@/components/ca/CaDrawingPicker";
import { CaDrawingViewer } from "@/components/ca/CaDrawingViewer";
import { CaPhotoGroups } from "@/components/ca/CaPhotoGroups";
import { CaPhotoSheet } from "@/components/ca/CaPhotoSheet";
import { CaPinSheet } from "@/components/ca/CaPinSheet";
import { CaStateLink } from "@/components/ca/CaStateLink";
import { EmptyState } from "@/components/EmptyState";
import { notifyError } from "@/components/ui/toaster";
import { useCaProject } from "@/context/CaProjectContext";
import { useCaPhotos } from "@/hooks/ca/useCaPhotos";
import { useCaPins } from "@/hooks/ca/useCaPins";
import { useReportSheets } from "@/hooks/ca/useReportSheets";
import { groupPhotosByPin } from "@/lib/ca/photoGroups";
import { numberPins, pinName } from "@/lib/ca/pins";
import { photosOfReport } from "@/lib/ca/reportPhotos";
import { defaultSheet } from "@/lib/ca/reportSheets";
import { caReportPath } from "@/lib/ca/routes";
import { isSyncedSet } from "@/lib/ca/syncedSets";
import { updateCaDrawing } from "@/services/ca/drawingService";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
    {children}
  </Text>
);

/**
 * A report's Capture step: floor plans with photo pins, plus quick photo
 * capture. Photos taken here belong to this report. Drawings and pins belong
 * to the project, so the same locations can be used on every visit.
 *
 * Floor plans come from the drawing set the report was made with: the CA
 * application's current set when the report was started, synced on the
 * server. Every sheet of it is listed; one nobody has opened yet is rendered
 * on this device the first time it is chosen. With no set in the CA
 * application, drawings are added by hand ("Add drawing").
 *
 * Everything captured here is saved on the device first and syncs on its own,
 * so the step works with no signal once the drawing has been opened online.
 */
export function CaReportCaptureStep({ reportId }: { reportId: string }) {
  const { projectNumber } = useCaProject();
  const { photos: allPhotos, loaded, serverReachable, editPhoto, deletePhoto } = useCaPhotos(projectNumber);
  const sheets = useReportSheets(projectNumber, reportId);
  const { drawings, loaded: drawingsLoaded, refresh: refreshDrawings, added } = sheets.drawingsHook;
  const { sheetSets, choices, online, prepare, preparing, failed } = sheets;
  const { pins, dropPin, editPin, deletePin } = useCaPins(projectNumber);

  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [openPinId, setOpenPinId] = useState<string | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  const photos = photosOfReport(allPhotos, reportId);
  const drawing = choices.find((d) => d.id === drawingId) ?? defaultSheet(choices);
  const syncedDrawing = Boolean(
    drawing?.drawingSetId && sheetSets.sets.some((s) => s.id === drawing.drawingSetId && isSyncedSet(s)),
  );
  // Waiting for the CA application's set: copied on the server, or listed on a device.
  const settingUp =
    !drawing && (sheetSets.syncing || Boolean(sheets.set && sheets.set.indexed === false) || !sheetSets.loaded);

  // A sheet nobody has opened yet is rendered when shown.
  useEffect(() => {
    if (drawing?.unrendered && online && !failed[drawing.id]) void prepare(drawing);
  }, [drawing, online, failed, prepare]);

  const numbers = numberPins(pins);
  const pinNames = new Map(pins.map((p) => [p.id, pinName(p, numbers.get(p.id))]));
  const photoCount = new Map<string, number>();
  for (const photo of photos) {
    if (photo.pinId) photoCount.set(photo.pinId, (photoCount.get(photo.pinId) ?? 0) + 1);
  }
  const photoGroups = groupPhotosByPin({ photos, pins, pinNumbers: numbers, pinNames, drawings });
  const sheetPins = drawing ? pins.filter((p) => p.drawingId === drawing.id) : [];

  const openPin = pins.find((p) => p.id === openPinId) ?? null;
  // Looked up by id, so the open sheet reflects edits and sync as they happen.
  const openPhoto = photos.find((p) => p.id === openPhotoId) ?? null;

  async function onDrop(x: number, y: number) {
    if (!drawing) return;
    try {
      const pin = await dropPin(drawing.id, x, y);
      setDropMode(false);
      setOpenPinId(pin.id);
    } catch (error) {
      notifyError("Could not drop the pin", error);
    }
  }

  async function setCurrent(id: string, isCurrent: boolean) {
    try {
      await updateCaDrawing(projectNumber, id, { isCurrent });
      await refreshDrawings();
    } catch (error) {
      notifyError("Could not update the drawing", error);
    }
  }

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      {/* Floor plans and pins */}
      <Stack gap="3">
        <SectionLabel>Floor plans</SectionLabel>
        {!drawingsLoaded ? (
          <HStack gap="3" py="6" justify="center">
            <Spinner size="sm" color="brand.solid" />
            <Text color="fg.muted">Loading drawings…</Text>
          </HStack>
        ) : settingUp ? (
          <HStack gap="3" py="6" justify="center" data-testid="ca-drawings-syncing">
            <Spinner size="sm" color="brand.solid" />
            <Text color="fg.muted">Getting the latest drawings from the CA application…</Text>
          </HStack>
        ) : !drawing ? (
          <EmptyState
            icon={<LuMap />}
            title="No floor plans yet"
            description="Add a drawing to pin photos to the spots where they were taken."
            action={
              <Button colorPalette="brand" size="lg" onClick={() => setAddOpen(true)}>
                <LuPlus /> Add drawing
              </Button>
            }
          />
        ) : (
          <>
            <CaDrawingPicker
              drawings={choices}
              value={drawing}
              onChange={(id) => {
                setDrawingId(id);
                setDropMode(false);
              }}
              onAdd={() => setAddOpen(true)}
              // The CA application decides which of its sheets are current.
              onSetCurrent={syncedDrawing ? undefined : (d, isCurrent) => void setCurrent(d.id, isCurrent)}
            />
            {sheets.set && <SetLine sheets={sheets} />}
            {drawing.unrendered ? (
              <Box
                borderWidth="1px"
                borderColor="line"
                borderRadius="md"
                py="12"
                px="4"
                textAlign="center"
                data-testid="ca-sheet-preparing"
              >
                {failed[drawing.id] ? (
                  <Stack gap="3" align="center">
                    <Text color="fg.error">{failed[drawing.id]}</Text>
                    <Button variant="outline" onClick={() => sheets.retry(drawing.id)}>
                      Try again
                    </Button>
                  </Stack>
                ) : !online && !preparing[drawing.id] ? (
                  <Stack gap="2" align="center" color="fg.muted">
                    <LuCloudOff aria-hidden />
                    <Text>This sheet has not been opened on this device yet. It opens when you have signal.</Text>
                  </Stack>
                ) : (
                  <HStack gap="3" justify="center">
                    <Spinner size="sm" color="brand.solid" />
                    <Text color="fg.muted">Opening {drawing.sheetNumber ?? drawing.title}…</Text>
                  </HStack>
                )}
              </Box>
            ) : (
            <CaDrawingViewer
              key={drawing.id}
              src={drawing.src}
              width={drawing.width}
              height={drawing.height}
              title={`Drawing ${drawing.sheetNumber ?? ""} ${drawing.title}`.trim()}
              dropMode={dropMode}
              onDrop={onDrop}
              onPinTap={setOpenPinId}
              pins={sheetPins.map((p) => {
                const n = numbers.get(p.id);
                const count = photoCount.get(p.id) ?? 0;
                return {
                  id: p.id,
                  x: p.x,
                  y: p.y,
                  marker: String(n ?? ""),
                  name: `${pinNames.get(p.id)}, ${count} photo${count === 1 ? "" : "s"}${p.syncState === "synced" ? "" : ", waiting to upload"}`,
                  pending: p.syncState !== "synced",
                };
              })}
            />
            )}
            {drawing.unrendered ? null : dropMode ? (
              <HStack gap="3" justify="space-between" bg="brand.subtle" borderRadius="md" px="4" py="3" data-print="hide">
                <Text fontWeight="medium" color="brand.fg">
                  Tap the drawing where the photos are.
                </Text>
                <Button variant="outline" size="lg" onClick={() => setDropMode(false)} bg="bg">
                  <LuX /> Cancel
                </Button>
              </HStack>
            ) : (
              <Button colorPalette="brand" size="xl" minH="64px" onClick={() => setDropMode(true)} data-print="hide">
                <LuMapPin /> Drop pin
              </Button>
            )}
          </>
        )}
      </Stack>

      {/* Quick capture and this report's photos */}
      <Stack gap="3">
        <SectionLabel>Photos{loaded ? ` (${photos.length})` : ""}</SectionLabel>
        <CaCaptureBar projectNumber={projectNumber} reportId={reportId} />
        {!serverReachable && (
          <Text fontSize="sm" color="fg.muted">
            Showing photos on this device
          </Text>
        )}
        {!loaded ? (
          <HStack gap="3" py="6" justify="center">
            <Spinner size="sm" color="brand.solid" />
            <Text color="fg.muted">Loading photos…</Text>
          </HStack>
        ) : photos.length === 0 ? (
          <EmptyState
            icon={<LuImages />}
            title="No photos yet"
            description="Take or choose photos, or drop a pin and take them there. They are saved on this device right away and upload when there is a connection."
          />
        ) : (
          <>
            <CaPhotoGroups
              projectNumber={projectNumber}
              groups={photoGroups}
              onOpen={(p) => setOpenPhotoId(p.id)}
              onSelectGroup={() => {}}
              onOpenPin={(pinId) => {
                const pin = pins.find((p) => p.id === pinId);
                if (pin) setDrawingId(pin.drawingId);
                setOpenPinId(pinId);
              }}
            />
            <Button asChild colorPalette="brand" size="xl" minH="64px" data-print="hide">
              <CaStateLink href={caReportPath(projectNumber, reportId, "report")}>
                Continue to report <LuArrowRight />
              </CaStateLink>
            </Button>
          </>
        )}
      </Stack>

      <CaAddDrawingDialog
        projectNumber={projectNumber}
        drawings={drawings}
        sheetSets={sheetSets}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(d, sheet) => {
          void added(d, sheet);
          setDrawingId(d.id);
        }}
      />

      <CaPinSheet
        projectNumber={projectNumber}
        pin={openPin}
        number={openPin ? (numbers.get(openPin.id) ?? 0) : 0}
        reportId={reportId}
        photos={photos}
        onClose={() => setOpenPinId(null)}
        onSave={(patch) => editPin(openPin!.id, patch)}
        onDelete={() => deletePin(openPin!.id)}
        onOpenPhoto={(p) => setOpenPhotoId(p.id)}
      />

      <CaPhotoSheet
        photo={openPhoto}
        onClose={() => setOpenPhotoId(null)}
        onSaveCaption={(id, caption) => editPhoto(id, { caption })}
        pinName={openPhoto?.pinId ? pinNames.get(openPhoto.pinId) : undefined}
        onUnpin={(id) => editPhoto(id, { pinId: undefined })}
        onDelete={deletePhoto}
      />
    </Stack>
  );
}

/** Which drawing set the report uses, and saving its sheets for a visit with no signal. */
function SetLine({ sheets }: { sheets: ReturnType<typeof useReportSheets> }) {
  const set = sheets.set!;
  const progress = sheets.offlineProgress;
  return (
    <HStack gap="2" justify="space-between" wrap="wrap" fontSize="sm" color="fg.muted">
      <Text data-testid="ca-report-drawing-set">
        Drawing set: {set.revisionLabel ?? set.title ?? set.fileName}
        {set.isCurrent === false ? " (a newer set is in the CA application)" : ""}
      </Text>
      {sheets.online && sheets.choices.some((c) => c.unrendered) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void sheets.saveAllForOffline()}
          loading={Boolean(progress)}
          loadingText={progress ? `Saving sheets… ${progress.done} of ${progress.total}` : undefined}
          data-testid="ca-save-sheets-offline"
        >
          <LuCloudDownload /> Save all sheets for offline
        </Button>
      )}
    </HStack>
  );
}
