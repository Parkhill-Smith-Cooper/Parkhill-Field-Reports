"use client";

import {
  Button,
  CloseButton,
  Dialog,
  IconButton,
  Input,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuEllipsis, LuPencil, LuTrash2 } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import { deleteCaProject, updateCaProject } from "@/services/ca/projectService";
import type { CaProject } from "@/types/ca";

/**
 * The "…" menu on a CA project row (CA_plan.pdf p.1): edit the project's
 * details, or delete it. The server refuses to delete a project that has
 * issued reports, because issued revisions are permanent records.
 */
export function CaProjectActions({
  project,
  onUpdated,
  onDeleted,
}: {
  project: CaProject;
  onUpdated: (project: CaProject) => void;
  onDeleted: (projectNumber: string) => void;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client);
  const [busy, setBusy] = useState(false);

  function openEdit() {
    setName(project.name);
    setClient(project.client);
    setDialog("edit");
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      onUpdated(await updateCaProject(project.projectNumber, { name, client }));
      toaster.create({ type: "success", title: "Project updated" });
      setDialog(null);
    } catch (error) {
      notifyError("Could not update the project", error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteCaProject(project.projectNumber);
      toaster.create({ type: "success", title: `Project ${project.projectNumber} deleted` });
      setDialog(null);
      onDeleted(project.projectNumber);
    } catch (error) {
      notifyError("Could not delete the project", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <IconButton
            variant="ghost"
            size="lg"
            aria-label={`Actions for project ${project.projectNumber}`}
          >
            <LuEllipsis />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="200px">
              <Menu.Item value="edit" py="2.5" cursor="pointer" onClick={openEdit}>
                <LuPencil />
                Edit details
              </Menu.Item>
              <Menu.Item
                value="delete"
                py="2.5"
                cursor="pointer"
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
                onClick={() => setDialog("delete")}
              >
                <LuTrash2 />
                Delete project
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      <Dialog.Root
        open={dialog !== null}
        onOpenChange={(e) => !e.open && !busy && setDialog(null)}
        placement="center"
        role={dialog === "delete" ? "alertdialog" : "dialog"}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content mx="4">
              <Dialog.Header>
                <Dialog.Title>
                  {dialog === "delete" ? `Delete project ${project.projectNumber}?` : "Edit project"}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                {dialog === "delete" ? (
                  <Text>
                    This removes the project with its drawings, photos, pins and draft
                    reports. It cannot be undone. Projects with issued reports cannot be
                    deleted.
                  </Text>
                ) : (
                  <Stack gap="4">
                    <FormField label="Project name" required error={name.trim() ? undefined : "Project name is required."}>
                      <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} />
                    </FormField>
                    <FormField label="Client (report “To”)">
                      <Input size="lg" value={client} onChange={(e) => setClient(e.target.value)} />
                    </FormField>
                  </Stack>
                )}
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" size="lg" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                {dialog === "delete" ? (
                  <Button colorPalette="red" size="lg" loading={busy} onClick={remove}>
                    Delete project
                  </Button>
                ) : (
                  <Button colorPalette="brand" size="lg" loading={busy} disabled={!name.trim()} onClick={save}>
                    Save
                  </Button>
                )}
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="md" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
