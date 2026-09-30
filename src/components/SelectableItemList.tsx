"use client";

import {
  Badge,
  Box,
  Button,
  CheckboxCard,
  Fieldset,
  HStack,
  IconButton,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuCheck, LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";

import type { SelectableItem } from "@/types";

type SelectableItemListProps = {
  legend: string;
  helperText: string;
  items: SelectableItem[];
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAddCustom: (text: string) => void;
  addLabel: string;
  addPlaceholder: string;
  /** Singular wording for the empty state, counts and button labels. */
  noun: string;
};

/**
 * Selection, editing and authoring of causes or corrective actions.
 *
 * Written once and used by both Step 2 and Step 3. Causes and actions share the
 * `SelectableItem` shape precisely so that select / deselect / add-custom /
 * edit / remove exists in one place instead of twice.
 *
 * Three details that are deliberate:
 *
 * - `CheckboxCard` gives a whole-row hit target, which is what makes this
 *   usable with a thumb on a phone; a bare checkbox would be a 16px target.
 * - The group is wrapped in `Fieldset.Root`, **not** `Field.Root`. Wrapping a
 *   checkbox group in `Field.Root` is a documented Chakra bug where only the
 *   first card responds to clicks.
 * - Edit and remove sit *outside* the card. `CheckboxCard.Control` renders a
 *   label, and a button nested in a label both is invalid HTML and has its
 *   clicks stolen by the label's own toggle behaviour.
 */
export function SelectableItemList({
  legend,
  helperText,
  items,
  onToggle,
  onEdit,
  onRemove,
  onAddCustom,
  addLabel,
  addPlaceholder,
  noun,
}: SelectableItemListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const selectedCount = items.filter((item) => item.selected).length;

  function startEditing(item: SelectableItem) {
    setEditingId(item.id);
    setEditingText(item.text);
  }

  function commitEdit() {
    if (editingId && editingText.trim().length > 0) {
      onEdit(editingId, editingText.trim());
    }
    setEditingId(null);
    setEditingText("");
  }

  function commitAdd() {
    if (newText.trim().length > 0) {
      onAddCustom(newText);
    }
    setNewText("");
    setAdding(false);
  }

  return (
    <Fieldset.Root>
      <Stack gap="1" mb="1">
        <Fieldset.Legend fontSize="md" fontWeight="semibold" color="fg">
          {legend}
        </Fieldset.Legend>
        <Fieldset.HelperText>{helperText}</Fieldset.HelperText>
      </Stack>

      <Stack gap="2.5" width="full">
        {items.map((item) =>
          editingId === item.id ? (
            <Box
              key={item.id}
              borderWidth="1px"
              borderColor="brand.solid"
              borderRadius="md"
              p="3"
            >
              <Stack gap="3">
                <Textarea
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  autoresize
                  rows={3}
                  autoFocus
                  aria-label={`Edit ${noun}`}
                />
                <HStack gap="2" justify="flex-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    <LuX />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="brand"
                    onClick={commitEdit}
                    disabled={editingText.trim().length === 0}
                  >
                    <LuCheck />
                    Done
                  </Button>
                </HStack>
              </Stack>
            </Box>
          ) : (
            <HStack key={item.id} align="stretch" gap="1.5">
              <CheckboxCard.Root
                checked={item.selected}
                onCheckedChange={() => onToggle(item.id)}
                colorPalette="brand"
                size="sm"
                flex="1"
                minW="0"
              >
                <CheckboxCard.HiddenInput />
                <CheckboxCard.Control alignItems="flex-start" gap="3" py="3">
                  <CheckboxCard.Content gap="1.5">
                    <CheckboxCard.Label
                      fontWeight="normal"
                      lineHeight="short"
                      // Long text must wrap rather than truncate: the engineer
                      // is making a judgement call and needs to read all of it.
                      whiteSpace="normal"
                    >
                      {item.text}
                    </CheckboxCard.Label>
                    {item.isCustom && (
                      <Badge
                        size="xs"
                        variant="subtle"
                        colorPalette="gray"
                        alignSelf="flex-start"
                      >
                        Added by you
                      </Badge>
                    )}
                  </CheckboxCard.Content>
                  <CheckboxCard.Indicator />
                </CheckboxCard.Control>
              </CheckboxCard.Root>

              <Stack gap="1" justify="center" flexShrink="0">
                <IconButton
                  size="sm"
                  variant="ghost"
                  colorPalette="gray"
                  aria-label={`Edit this ${noun}`}
                  onClick={() => startEditing(item)}
                >
                  <LuPencil />
                </IconButton>
                {item.isCustom && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    colorPalette="gray"
                    aria-label={`Remove this ${noun}`}
                    onClick={() => onRemove(item.id)}
                  >
                    <LuTrash2 />
                  </IconButton>
                )}
              </Stack>
            </HStack>
          ),
        )}
      </Stack>

      {adding ? (
        <Box
          mt="3"
          borderWidth="1px"
          borderColor="line"
          borderRadius="md"
          p="3"
          width="full"
        >
          <Stack gap="3">
            <Textarea
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              placeholder={addPlaceholder}
              autoresize
              rows={3}
              autoFocus
              aria-label={addLabel}
            />
            <HStack gap="2" justify="flex-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewText("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                colorPalette="brand"
                onClick={commitAdd}
                disabled={newText.trim().length === 0}
              >
                <LuCheck />
                Add
              </Button>
            </HStack>
          </Stack>
        </Box>
      ) : (
        <Button
          mt="3"
          variant="outline"
          size={{ base: "md", md: "sm" }}
          width={{ base: "full", sm: "auto" }}
          alignSelf="flex-start"
          onClick={() => setAdding(true)}
        >
          <LuPlus />
          {addLabel}
        </Button>
      )}

      <Text mt="3" fontSize="sm" color="fg.muted">
        {selectedCount === 0
          ? `No ${noun}s selected yet.`
          : `${selectedCount} ${noun}${selectedCount === 1 ? "" : "s"} selected.`}
      </Text>
    </Fieldset.Root>
  );
}
