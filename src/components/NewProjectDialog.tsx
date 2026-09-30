"use client";

import {
  Button,
  CloseButton,
  Dialog,
  Input,
  Portal,
  Stack,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";

import { FormField } from "@/components/FormField";
import { notifyError, toaster } from "@/components/ui/toaster";
import {
  isValidProjectNumber,
  PROJECT_NUMBER_HINT,
} from "@/lib/validation";
import { createProject } from "@/services/projectService";
import type { Project } from "@/types";

/**
 * Creates a project.
 *
 * The project number is validated client-side against the same pattern the API
 * enforces (`src/lib/validation.ts`), so the engineer gets the correction
 * immediately rather than after a round trip - and the server still validates,
 * because a client check is a convenience and never a guarantee.
 */
export function NewProjectDialog({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projectNumber, setProjectNumber] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ number?: string; name?: string }>({});
  const [saving, setSaving] = useState(false);

  function close() {
    setOpen(false);
    setProjectNumber("");
    setName("");
    setErrors({});
  }

  async function submit() {
    const nextErrors: typeof errors = {};
    if (!isValidProjectNumber(projectNumber.trim())) {
      nextErrors.number = PROJECT_NUMBER_HINT;
    }
    if (name.trim().length === 0) {
      nextErrors.name = "Enter the project name.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const project = await createProject({
        projectNumber: projectNumber.trim(),
        name: name.trim(),
      });
      toaster.create({
        type: "success",
        title: `Project ${project.projectNumber} created`,
      });
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
      onOpenChange={(event) => (event.open ? setOpen(true) : close())}
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
                  label="Project number"
                  required
                  helperText="Used to file every observation and photo for this project."
                  error={errors.number}
                >
                  <Input
                    value={projectNumber}
                    onChange={(event) => setProjectNumber(event.target.value)}
                    placeholder="24-1057"
                    autoComplete="off"
                    // Field staff type project numbers constantly; no
                    // autocapitalisation or correction getting in the way.
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </FormField>

                <FormField label="Project name" required error={errors.name}>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Midland ISD Natatorium"
                  />
                </FormField>
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button colorPalette="brand" loading={saving} onClick={submit}>
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
