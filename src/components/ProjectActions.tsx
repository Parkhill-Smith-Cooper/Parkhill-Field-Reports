"use client";

import {
  Button,
  CloseButton,
  Dialog,
  HStack,
  IconButton,
  Input,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuEllipsis, LuPencil, LuTrash2 } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import { PROJECT_NAME_MAX_LENGTH } from "@/lib/validation";
import { fetchObservations } from "@/services/observationService";
import { deleteProject, updateProject } from "@/services/projectService";
import type { Project } from "@/types";

/**
 * Edit and delete controls for one project row. Sits beside the row's link
 * rather than inside it, so tapping a button never navigates.
 */
export function ProjectActions({
  project,
  onUpdated,
  onDeleted,
}: {
  project: Project;
  onUpdated: (project: Project) => void;
  onDeleted: (projectNumber: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <HStack gap="1" flexShrink="0">
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <IconButton
            aria-label={`Actions for project ${project.projectNumber}`}
            variant="ghost"
            size="sm"
          >
            <LuEllipsis />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="10rem">
              <Menu.Item
                value="edit"
                cursor="pointer"
                onClick={() => setEditing(true)}
              >
                <LuPencil />
                Edit
              </Menu.Item>
              <Menu.Item
                value="delete"
                cursor="pointer"
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
                onClick={() => setDeleting(true)}
              >
                <LuTrash2 />
                Delete
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      {editing && (
        <EditProjectDialog
          project={project}
          onClose={() => setEditing(false)}
          onUpdated={onUpdated}
        />
      )}
      {deleting && (
        <DeleteProjectDialog
          project={project}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </HStack>
  );
}

function EditProjectDialog({
  project,
  onClose,
  onUpdated,
}: {
  project: Project;
  onClose: () => void;
  onUpdated: (project: Project) => void;
}) {
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const unchanged = trimmed === project.name;

  async function submit() {
    if (trimmed.length === 0 || unchanged) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.projectNumber, trimmed);
      toaster.create({
        type: "success",
        title: `Project ${updated.projectNumber} updated`,
      });
      onUpdated(updated);
      onClose();
    } catch (error) {
      notifyError("Could not update the project", error);
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(event) => {
        if (!event.open && !saving) onClose();
      }}
      placement="center"
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>Edit project</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="4">
                <FormField
                  label="Project number"
                  helperText="Set by VantagePoint and cannot be changed."
                >
                  <Input value={project.projectNumber} disabled />
                </FormField>
                <FormField label="Project name" required>
                  <Input
                    value={name}
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submit();
                    }}
                    autoComplete="off"
                  />
                </FormField>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button
                colorPalette="brand"
                loading={saving}
                disabled={trimmed.length === 0 || unchanged}
                onClick={submit}
              >
                Save changes
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" disabled={saving} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: (projectNumber: string) => void;
}) {
  // How much is about to be lost, so the warning can say so. `null` while
  // loading; `undefined` if the count could not be fetched.
  const [count, setCount] = useState<number | null | undefined>(null);
  const [removing, setRemoving] = useState(false);

  // The dialog only mounts while open, so this runs once per opening.
  useEffect(() => {
    let active = true;
    fetchObservations(project.projectNumber)
      .then((observations) => {
        if (active) setCount(observations.length);
      })
      .catch(() => {
        if (active) setCount(undefined);
      });
    return () => {
      active = false;
    };
  }, [project.projectNumber]);

  async function confirm() {
    setRemoving(true);
    try {
      await deleteProject(project.projectNumber);
      toaster.create({
        type: "success",
        title: `Project ${project.projectNumber} deleted`,
      });
      onDeleted(project.projectNumber);
      onClose();
    } catch (error) {
      notifyError("Could not delete the project", error);
      setRemoving(false);
    }
  }

  const consequence =
    count === null
      ? "Checking what is recorded against it…"
      : count === undefined
        ? "All of its observations and photos will be deleted too."
        : count === 0
          ? "It has no observations."
          : `Its ${count} ${count === 1 ? "observation" : "observations"} and all of their photos will be deleted too.`;

  return (
    <Dialog.Root
      role="alertdialog"
      open
      onOpenChange={(event) => {
        if (!event.open && !removing) onClose();
      }}
      placement="center"
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>Delete this project?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text>
                  <Text as="span" fontWeight="semibold">
                    {project.projectNumber}
                  </Text>{" "}
                  — {project.name}
                </Text>
                <Text color="fg.muted">{consequence}</Text>
                <Text fontWeight="semibold" color="red.fg">
                  This cannot be undone.
                </Text>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" disabled={removing} onClick={onClose}>
                Cancel
              </Button>
              <Button
                colorPalette="red"
                loading={removing}
                disabled={count === null}
                onClick={confirm}
              >
                Delete project
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
