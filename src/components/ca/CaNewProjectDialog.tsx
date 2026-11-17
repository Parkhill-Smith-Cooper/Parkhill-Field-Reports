"use client";

import {
  Alert,
  Button,
  CloseButton,
  Combobox,
  Dialog,
  Input,
  Portal,
  SegmentGroup,
  Stack,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import { PROJECT_NUMBER_HINT, PROJECT_NUMBER_PATTERN } from "@/lib/validation";
import {
  createCaProject,
  fetchCaSourceProjects,
} from "@/services/ca/projectService";
import type { CaProject, CaSourceProject } from "@/types/ca";

const SOURCE_NAMES: Record<CaSourceProject["source"], string> = {
  "ca-app": "the CA app",
  vantagepoint: "VantagePoint",
  mock: "mock sample projects",
};

const optionLabel = (p: CaSourceProject) => `${p.projectNumber} - ${p.name}`;

type Mode = "source" | "manual";

/**
 * Creates a CA project, either picked from the configured upstream source
 * (the CA application once connected; mock or VantagePoint until then) or
 * entered by hand. Manual entry is always available, so a missing or broken
 * upstream connection never blocks field work.
 */
export function CaNewProjectDialog({
  onCreated,
}: {
  onCreated: (project: CaProject) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("source");
  const [loading, setLoading] = useState(false);
  const [sourceKind, setSourceKind] = useState<CaSourceProject["source"] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaSourceProject | null>(null);
  const [manual, setManual] = useState({ projectNumber: "", name: "", client: "" });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const { contains } = useFilter({ sensitivity: "base" });
  const { collection, filter, set } = useListCollection<CaSourceProject>({
    initialItems: [],
    itemToString: optionLabel,
    itemToValue: (p) => p.projectNumber,
    filter: contains,
    limit: 50,
  });

  async function openDialog() {
    setOpen(true);
    setMode("source");
    setLoading(true);
    setSourceError(null);
    try {
      const result = await fetchCaSourceProjects();
      setSourceKind(result.source);
      set(result.projects);
      // Only force manual entry when there is no source. Never switch back to
      // "source": the engineer may already have chosen "Enter manually" while
      // the list was loading, and their typing must not disappear.
      if (!result.source) setMode("manual");
    } catch (error) {
      // The upstream feed failing is not a reason to stop: offer manual entry.
      setSourceError(error instanceof Error ? error.message : "The project source is unavailable.");
      setMode("manual");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setSelected(null);
    setManual({ projectNumber: "", name: "", client: "" });
    setTouched(false);
    filter("");
  }

  const numberValid = PROJECT_NUMBER_PATTERN.test(manual.projectNumber.trim());
  const nameValid = manual.name.trim().length > 0;
  const canSubmit = mode === "source" ? Boolean(selected) : numberValid && nameValid;

  async function submit() {
    setTouched(true);
    if (!canSubmit) return;
    setSaving(true);
    try {
      const project = await createCaProject(
        mode === "source" && selected
          ? {
              projectNumber: selected.projectNumber,
              name: selected.name,
              client: selected.client,
              source: selected.source,
              externalRef: selected.externalRef,
            }
          : {
              projectNumber: manual.projectNumber.trim(),
              name: manual.name.trim(),
              client: manual.client.trim(),
              source: "manual",
            },
      );
      toaster.create({ type: "success", title: `Project ${project.projectNumber} created` });
      onCreated(project);
      close();
    } catch (error) {
      notifyError("Could not create the project", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(event) => (event.open ? openDialog() : close())}
      placement="center"
      motionPreset="slide-in-bottom"
    >
      <Dialog.Trigger asChild>
        <Button colorPalette="brand" size={{ base: "lg", md: "md" }} width={{ base: "full", md: "auto" }}>
          <LuPlus />
          New project
        </Button>
      </Dialog.Trigger>

      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>New CA project</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap="4">
                {sourceKind && (
                  <SegmentGroup.Root
                    value={mode}
                    onValueChange={(e) => setMode(e.value as Mode)}
                    size="lg"
                    width="full"
                  >
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Items
                      flex="1"
                      justifyContent="center"
                      items={[
                        { value: "source", label: "Pick a project" },
                        { value: "manual", label: "Enter manually" },
                      ]}
                    />
                  </SegmentGroup.Root>
                )}

                {sourceError && (
                  <Alert.Root status="warning" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{sourceError}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}

                {mode === "source" && sourceKind ? (
                  <FormField
                    label="Project"
                    required
                    helperText={`Search ${SOURCE_NAMES[sourceKind]} by project number or name.`}
                  >
                    <Combobox.Root
                      collection={collection}
                      value={selected ? [selected.projectNumber] : []}
                      onValueChange={(e) => setSelected(e.items[0] ?? null)}
                      onInputValueChange={(e) => filter(e.inputValue)}
                      openOnClick
                      disabled={loading}
                      width="full"
                      size="lg"
                    >
                      <Combobox.Control>
                        <Combobox.Input
                          placeholder={loading ? "Loading projects…" : "Select a project"}
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <Combobox.IndicatorGroup>
                          <Combobox.ClearTrigger />
                          <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                      </Combobox.Control>
                      <Combobox.Positioner>
                        <Combobox.Content>
                          <Combobox.Empty>No matching projects</Combobox.Empty>
                          {collection.items.map((p) => (
                            <Combobox.Item item={p} key={p.projectNumber}>
                              <Combobox.ItemText>{optionLabel(p)}</Combobox.ItemText>
                              <Combobox.ItemIndicator />
                            </Combobox.Item>
                          ))}
                        </Combobox.Content>
                      </Combobox.Positioner>
                    </Combobox.Root>
                  </FormField>
                ) : (
                  <>
                    <FormField
                      label="Project number"
                      required
                      helperText={PROJECT_NUMBER_HINT}
                      error={touched && !numberValid ? "Enter a valid project number." : undefined}
                    >
                      <Input
                        size="lg"
                        value={manual.projectNumber}
                        onChange={(e) => setManual((m) => ({ ...m, projectNumber: e.target.value }))}
                        placeholder="45371.25.01"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                    </FormField>
                    <FormField
                      label="Project name"
                      required
                      error={touched && !nameValid ? "Project name is required." : undefined}
                    >
                      <Input
                        size="lg"
                        value={manual.name}
                        onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                        placeholder="Elementary School 01 — New Construction"
                      />
                    </FormField>
                    <FormField label="Client (report “To”)" helperText="Optional. Each report can change it.">
                      <Input
                        size="lg"
                        value={manual.client}
                        onChange={(e) => setManual((m) => ({ ...m, client: e.target.value }))}
                        placeholder="Lubbock ISD"
                      />
                    </FormField>
                  </>
                )}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" size="lg" disabled={saving}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button colorPalette="brand" size="lg" loading={saving} disabled={loading} onClick={submit}>
                Create project
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="md" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
