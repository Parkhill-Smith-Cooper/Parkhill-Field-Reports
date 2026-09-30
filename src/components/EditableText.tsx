"use client";

import { Box, HStack, IconButton, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";

/**
 * Click-to-edit text, used throughout the report preview.
 *
 * The report should read as a document rather than a form: text sits in place
 * at normal weight until the engineer clicks it, then becomes a textarea, and
 * commits on blur. Blur-to-commit is the forgiving behaviour for someone
 * editing on a phone - tapping anywhere else keeps the edit rather than
 * discarding it. `Escape` reverts, for the case where it was opened by mistake.
 *
 * This is a deliberate, controlled implementation rather than Chakra's
 * `Editable`: that component sizes its preview from the input and renders a
 * multi-line value as a single clipped line, which is wrong for observation
 * narratives and corrective-action wording - the two things most often edited
 * here.
 */
export function EditableText({
  value,
  onChange,
  label,
  placeholder,
  fontSize = "sm",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Field observation". */
  label: string;
  placeholder?: string;
  fontSize?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  function open() {
    setText(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = text.trim();
    // An empty value is almost always a mis-tap rather than an intent to
    // delete the wording, so it reverts.
    if (next.length > 0 && next !== value) onChange(next);
  }

  if (editing) {
    return (
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
        placeholder={placeholder}
        aria-label={label}
        autoresize
        rows={3}
        fontSize={fontSize}
        lineHeight="tall"
        autoFocus
        width="full"
      />
    );
  }

  return (
    <HStack align="flex-start" gap="1" width="full">
      <Text
        as="div"
        flex="1"
        minW="0"
        fontSize={fontSize}
        lineHeight="tall"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        color={value ? "fg" : "fg.subtle"}
        px="1"
        mx="-1"
        borderRadius="sm"
        cursor="text"
        transition="background 0.12s"
        _hover={{ bg: "brand.muted" }}
        onClick={open}
      >
        {value || placeholder}
      </Text>

      {/* An explicit affordance, not a hover reveal: on a touch screen there
          is no hover, so the pencil is the only discoverable entry point. */}
      <Box data-print="hide" flexShrink="0">
        <IconButton
          variant="ghost"
          size="xs"
          colorPalette="gray"
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={open}
        >
          <LuPencil />
        </IconButton>
      </Box>
    </HStack>
  );
}
