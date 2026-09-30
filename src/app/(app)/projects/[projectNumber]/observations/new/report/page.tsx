"use client";

import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuPrinter, LuSave } from "react-icons/lu";

import { NavigationButtons } from "@/components/NavigationButtons";
import { ReportPreview } from "@/components/ReportPreview";
import { WizardShell } from "@/components/WizardShell";
import { notifyError, toaster } from "@/components/ui/toaster";
import { useObservationDraft } from "@/context/ObservationDraftContext";
import { useStepGuard } from "@/hooks/useStepGuard";
import { wizardPath } from "@/lib/workflowSteps";
import { saveObservation } from "@/services/observationService";
import { fetchProject } from "@/services/projectService";
import type { RecordedItem } from "@/types";

/**
 * Step 4 - review, edit, and commit the record.
 *
 * The engineer edits the report itself here rather than going back through the
 * steps: this is the document that will be issued, so this is where the final
 * wording belongs. Nothing has been written to Cosmos until Save.
 */
export default function ReportStepPage() {
  const params = useParams<{ projectNumber: string }>();
  const projectNumber = decodeURIComponent(params.projectNumber);
  const router = useRouter();

  const { draft, setField, editCause, editAction, reset } =
    useObservationDraft();
  const { ready } = useStepGuard(projectNumber, "report");

  const [projectName, setProjectName] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // The project name is on the report but not in the draft, so it is fetched
  // here rather than carried through three steps of state that never used it.
  useEffect(() => {
    let active = true;
    fetchProject(projectNumber)
      .then((project) => {
        if (active) setProjectName(project.name);
      })
      .catch(() => {
        // The report is still correct and complete without the name; the
        // project number identifies it.
      });
    return () => {
      active = false;
    };
  }, [projectNumber]);

  const selectedCauses = toRecorded(draft.causes);
  const selectedActions = toRecorded(draft.actions);

  async function save() {
    setSaving(true);
    try {
      const observation = await saveObservation(projectNumber, {
        id: draft.observationId,
        ...draft.form,
        photos: draft.photos,
        causes: selectedCauses,
        actions: selectedActions,
      });

      toaster.create({
        type: "success",
        title: "Field observation saved",
        description: `Recorded against project ${projectNumber}.`,
      });

      // Clear the draft only after the write has succeeded, so a failed save
      // never costs the engineer their work.
      reset();
      router.replace(
        `/projects/${encodeURIComponent(projectNumber)}/observations/${observation.id}`,
      );
    } catch (error) {
      notifyError("Could not save the field observation", error);
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <WizardShell projectNumber={projectNumber} step="report" width="3xl">
        <HStack gap="3" py="8" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading…</Text>
        </HStack>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      projectNumber={projectNumber}
      step="report"
      description="Click any text to edit it before saving. Once saved, this becomes the project record."
      width="3xl"
    >
      <Stack gap={{ base: 5, md: 6 }}>
        <ReportPreview
          projectNumber={projectNumber}
          projectName={projectName}
          form={draft.form}
          photos={draft.photos}
          causes={selectedCauses}
          actions={selectedActions}
          onObservationChange={(value) => setField("observation", value)}
          onCauseChange={editCause}
          onActionChange={editAction}
        />

        <NavigationButtons
          onBack={() => router.push(wizardPath(projectNumber, "actions"))}
          nextLabel="Save field observation"
          nextIcon={<LuSave />}
          onNext={save}
          nextLoading={saving}
        />

        <Button
          data-print="hide"
          variant="plain"
          size="sm"
          colorPalette="gray"
          alignSelf="flex-start"
          px="0"
          onClick={() => window.print()}
        >
          <LuPrinter />
          Print or save as PDF
        </Button>
      </Stack>
    </WizardShell>
  );
}

/**
 * The report and the stored record carry only what the engineer selected. The
 * candidate suggestions they rejected are not part of the record - what
 * matters is the determination, not the list it came from.
 */
function toRecorded(
  items: { id: string; text: string; selected: boolean; isCustom: boolean }[],
): RecordedItem[] {
  return items
    .filter((item) => item.selected)
    .map(({ id, text, isCustom }) => ({ id, text, isCustom }));
}
