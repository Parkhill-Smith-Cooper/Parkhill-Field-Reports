"use client";

import {
  Button,
  CloseButton,
  Combobox,
  Dialog,
  Portal,
  Stack,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import {
  createProject,
  fetchVantagePointProjects,
} from "@/services/projectService";
import type { Project, VantagePointProject } from "@/types";

// The list holds every active VantagePoint project (thousands); only the best
// matches for what has been typed so far are rendered.
const VISIBLE_OPTIONS = 50;

const optionLabel = (project: VantagePointProject) =>
  `${project.projectNumber} - ${project.name}`;

/**
 * Creates a project by picking it from VantagePoint, the same way projects are
 * created in the construction admin app (parkhill-ccr). Picking rather than
 * typing keeps project numbers and names identical to the firm's system of
 * record. Projects already set up here are left out of the list.
 */
export function NewProjectDialog({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<VantagePointProject | null>(null);
  const [saving, setSaving] = useState(false);

  const { contains } = useFilter({ sensitivity: "base" });
  const { collection, filter, set } = useListCollection<VantagePointProject>({
    initialItems: [],
    itemToString: optionLabel,
    itemToValue: (project) => project.projectNumber,
    filter: contains,
    limit: VISIBLE_OPTIONS,
  });

  async function openDialog() {
    setOpen(true);
    setLoading(true);
    try {
      // Fetched on every open so a project created moments ago - here or by a
      // colleague - is no longer offered.
      set(await fetchVantagePointProjects());
    } catch (loadError) {
      notifyError("Could not load VantagePoint projects", loadError);
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setSelected(null);
    filter("");
  }

  async function submit() {
    if (!selected) return;

    setSaving(true);
    try {
      const project = await createProject(selected);
      toaster.create({
        type: "success",
        title: `Project ${project.projectNumber} created`,
      });
      onCreated(project);
      close();
    } catch (createError) {
      notifyError("Could not create the project", createError);
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
        <Button
          colorPalette="brand"
          size={{ base: "lg", md: "md" }}
          width={{ base: "full", md: "auto" }}
        >
          <LuPlus />
          New project
        </Button>
      </Dialog.Trigger>

      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>New project</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap="4">
                <FormField
                  label="Project"
                  required
                  helperText="Search VantagePoint by project number or name."
                >
                  <Combobox.Root
                    collection={collection}
                    value={selected ? [selected.projectNumber] : []}
                    onValueChange={(event) => setSelected(event.items[0] ?? null)}
                    onInputValueChange={(event) => filter(event.inputValue)}
                    openOnClick
                    disabled={loading}
                    width="full"
                  >
                    <Combobox.Control>
                      <Combobox.Input
                        placeholder={
                          loading
                            ? "Loading VantagePoint projects…"
                            : "Select a project"
                        }
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <Combobox.IndicatorGroup>
                        <Combobox.ClearTrigger />
                        <Combobox.Trigger />
                      </Combobox.IndicatorGroup>
                    </Combobox.Control>

                    {/* Not portalled: inside a dialog the list must stay
                        within the dialog's focus trap. */}
                    <Combobox.Positioner>
                      <Combobox.Content>
                        <Combobox.Empty>No matching projects</Combobox.Empty>
                        {collection.items.map((project) => (
                          <Combobox.Item
                            item={project}
                            key={project.projectNumber}
                          >
                            <Combobox.ItemText>
                              {optionLabel(project)}
                            </Combobox.ItemText>
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Combobox.Root>
                </FormField>
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="brand"
                loading={saving}
                disabled={!selected}
                onClick={submit}
              >
                Create project
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
