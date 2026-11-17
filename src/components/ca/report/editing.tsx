"use client";

import { Menu, Portal } from "@chakra-ui/react";
import { useLayoutEffect, useRef } from "react";
import { LuCamera, LuImages, LuLayoutGrid, LuTrash2 } from "react-icons/lu";

/**
 * Editing primitives for the report, used in place of the template's static
 * text so the report is edited ON the template itself (what you see is what
 * prints).
 */

/**
 * Plain text the engineer types directly into the document. Renders the same
 * element and classes as the printed report, so it looks identical; an empty
 * field shows its placeholder (screen only).
 *
 * Uncontrolled while typing (the DOM holds the caret); the value is pushed in
 * only when it differs, e.g. when a draft loads.
 */
export function Editable({
  value,
  onChange,
  label,
  placeholder,
  multiline = false,
  as: Tag = "span",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  as?: "span" | "div" | "p";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (el.textContent ?? "") !== value) el.textContent = value;
  }, [value]);

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      className={`ef${multiline ? " ef-multi" : ""}${className ? ` ${className}` : ""}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={multiline || undefined}
      data-placeholder={placeholder ?? "Click to add"}
      spellCheck
      onInput={(event) => {
        const el = event.currentTarget;
        let text = el.textContent ?? "";
        // A field emptied by deleting can keep a stray newline; treat as empty.
        if (text === "\n") {
          el.textContent = "";
          text = "";
        }
        onChange(multiline ? text : text.replace(/\n/g, " "));
      }}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") event.preventDefault();
      }}
    />
  );
}

/**
 * The menu behind a photo box: take a photo, choose from the device, or pick
 * one of the project's photos. Camera and device photos are saved to the
 * project first (on this device, synced later), exactly like the Capture tab.
 */
export function PhotoSourceMenu({
  children,
  label,
  multiple = true,
  onFiles,
  onPickExisting,
  onRemove,
}: {
  /** The box itself (the menu trigger). */
  children: React.ReactElement;
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onPickExisting: () => void;
  onRemove?: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  function picked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onFiles(files);
  }

  return (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
      <input ref={library} type="file" accept="image/*" multiple={multiple} hidden onChange={picked} />
      <Menu.Root positioning={{ placement: "bottom" }}>
        <Menu.Trigger asChild aria-label={label}>
          {children}
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="240px" p="1.5">
              <Menu.Item value="camera" py="3" onClick={() => camera.current?.click()}>
                <LuCamera /> Take photo
              </Menu.Item>
              <Menu.Item value="library" py="3" onClick={() => library.current?.click()}>
                <LuImages /> Choose from device
              </Menu.Item>
              <Menu.Item value="project" py="3" onClick={onPickExisting}>
                <LuLayoutGrid /> Choose from project photos
              </Menu.Item>
              {onRemove && (
                <Menu.Item value="remove" py="3" color="fg.error" onClick={onRemove}>
                  <LuTrash2 /> Remove photo
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </>
  );
}
