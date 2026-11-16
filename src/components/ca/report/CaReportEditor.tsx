"use client";

import {
  AspectRatio,
  Box,
  Button,
  Checkbox,
  HStack,
  IconButton,
  Image,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowRight,
  LuArrowUp,
  LuImagePlus,
  LuPlus,
  LuTrash2,
  LuX,
} from "react-icons/lu";

import { CaPhotoPicker } from "@/components/ca/CaPhotoPicker";
import { FormField } from "@/components/FormField";
import type { CaPhotoView } from "@/hooks/ca/useCaPhotos";
import { newCaItemId } from "@/lib/ca/ids";
import { itemNumber } from "@/lib/ca/reportContent";
import { move } from "@/lib/ca/reportLayout";
import { CA_STATUS_LABELS } from "@/lib/ca/status";
import { CA_ITEM_STATUSES, type CaItemStatus, type CaReportContent, type CaReportItem } from "@/types/ca";

const WEATHER = ["clear", "overcast", "rain", "snow", "foggy", "cold"] as const;
const SITE = ["clear", "dusty", "muddy"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Every section of the Field Observation Report template, as a mobile-first
 * form. Controlled: each change is handed to `onChange`, which saves it on the
 * device (and syncs it) - there is no separate "Save" step.
 */
export function CaReportEditor({
  content,
  onChange,
  photos,
  pinNames,
}: {
  content: CaReportContent;
  onChange: (next: CaReportContent) => void;
  photos: CaPhotoView[];
  pinNames: Map<string, string>;
}) {
  const [picker, setPicker] = useState<{ kind: "cover" } | { kind: "item"; itemId: string } | null>(null);
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const set = <K extends keyof CaReportContent>(key: K, value: CaReportContent[K]) =>
    onChange({ ...content, [key]: value });
  const setItem = (id: string, patch: Partial<CaReportItem>) =>
    set(
      "items",
      content.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );

  const pickerItem = picker?.kind === "item" ? content.items.find((i) => i.id === picker.itemId) : undefined;

  return (
    <Stack gap={{ base: 5, md: 6 }}>
      <Section title="Visit details">
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
          <FormField label="To">
            <Input size="lg" value={content.to} maxLength={300} onChange={(e) => set("to", e.target.value)} />
          </FormField>
          <FormField label="From">
            <Input size="lg" value={content.from} maxLength={300} onChange={(e) => set("from", e.target.value)} />
          </FormField>
          <FormField label="Project">
            <Input size="lg" value={content.projectName} maxLength={300} onChange={(e) => set("projectName", e.target.value)} />
          </FormField>
          <FormField label="Project No.">
            <Input size="lg" value={content.projectNo} maxLength={300} onChange={(e) => set("projectNo", e.target.value)} />
          </FormField>
          <FormField label="Date Visited" helperText="Date Issued is set when the report is issued.">
            <Input size="lg" type="date" value={content.dateVisited} onChange={(e) => set("dateVisited", e.target.value)} />
          </FormField>
          <FormField label="Time">
            <Input size="lg" type="time" value={content.timeVisited} onChange={(e) => set("timeVisited", e.target.value)} />
          </FormField>
          <FormField label="% Complete">
            <Input
              size="lg"
              value={content.percentComplete}
              maxLength={300}
              inputMode="decimal"
              placeholder="e.g. 45%"
              onChange={(e) => set("percentComplete", e.target.value)}
            />
          </FormField>
        </SimpleGrid>
      </Section>

      <Section title="Project photo">
        <HStack gap="4" align="center" wrap="wrap">
          <Box w="160px" flexShrink="0">
            <AspectRatio ratio={4 / 3}>
              <Box borderRadius="md" overflow="hidden" bg="surface.muted" borderWidth="1px" borderColor="line">
                {content.coverPhotoId && photoById.get(content.coverPhotoId)?.src ? (
                  <Image src={photoById.get(content.coverPhotoId)!.src!} alt="Project photo" objectFit="cover" w="full" h="full" />
                ) : (
                  <Text fontSize="xs" color="fg.subtle" letterSpacing="wide">
                    {content.coverPhotoId ? "Not on this device" : "PROJECT PHOTO"}
                  </Text>
                )}
              </Box>
            </AspectRatio>
          </Box>
          <Stack gap="2">
            <Button variant="outline" size="lg" onClick={() => setPicker({ kind: "cover" })}>
              <LuImagePlus /> {content.coverPhotoId ? "Change photo" : "Choose photo"}
            </Button>
            {content.coverPhotoId && (
              <Button variant="ghost" size="lg" onClick={() => set("coverPhotoId", undefined)}>
                <LuX /> Remove
              </Button>
            )}
          </Stack>
        </HStack>
      </Section>

      <Section title="Weather and site conditions">
        <Stack gap="4">
          <Stack gap="2">
            <Text fontWeight="medium">Weather</Text>
            <HStack gap="2" wrap="wrap">
              {WEATHER.map((key) => (
                <Chip
                  key={key}
                  label={cap(key)}
                  on={content.weather[key]}
                  onToggle={() => set("weather", { ...content.weather, [key]: !content.weather[key] })}
                />
              ))}
            </HStack>
          </Stack>
          <FormField label="Temperature">
            <Input size="lg" value={content.temperature} maxLength={300} placeholder="e.g. 72°F" onChange={(e) => set("temperature", e.target.value)} />
          </FormField>
          <Stack gap="2">
            <Text fontWeight="medium">Site conditions</Text>
            <HStack gap="2" wrap="wrap">
              {SITE.map((key) => (
                <Chip
                  key={key}
                  label={cap(key)}
                  on={content.site[key]}
                  onToggle={() => set("site", { ...content.site, [key]: !content.site[key] })}
                />
              ))}
            </HStack>
          </Stack>
          <FormField label="Other site condition">
            <Input size="lg" value={content.site.other} maxLength={300} onChange={(e) => set("site", { ...content.site, other: e.target.value })} />
          </FormField>
        </Stack>
      </Section>

      <Section title="Site activity">
        <Stack gap="4">
          <Text fontWeight="medium">Persons contacted / present</Text>
          {content.persons.length === 0 && <Text color="fg.muted">None recorded.</Text>}
          {content.persons.map((person, i) => (
            <Stack key={i} gap="2" borderWidth="1px" borderColor="line" borderRadius="md" p="3">
              <SimpleGrid columns={{ base: 1, md: 3 }} gap="2">
                {(["name", "company", "email"] as const).map((key) => (
                  <Input
                    key={key}
                    size="lg"
                    aria-label={`Person ${i + 1} ${key}`}
                    placeholder={cap(key)}
                    type={key === "email" ? "email" : "text"}
                    value={person[key]}
                    maxLength={300}
                    onChange={(e) =>
                      set(
                        "persons",
                        content.persons.map((p, j) => (j === i ? { ...p, [key]: e.target.value } : p)),
                      )
                    }
                  />
                ))}
              </SimpleGrid>
              <Button
                variant="ghost"
                size="md"
                alignSelf="flex-start"
                onClick={() => set("persons", content.persons.filter((_, j) => j !== i))}
              >
                <LuTrash2 /> Remove person
              </Button>
            </Stack>
          ))}
          <Button
            variant="outline"
            size="lg"
            alignSelf="flex-start"
            onClick={() => set("persons", [...content.persons, { name: "", company: "", email: "" }])}
          >
            <LuPlus /> Add person
          </Button>
          <FormField label="Materials stored on-site">
            <Textarea size="lg" autoresize rows={2} value={content.materialsStored} onChange={(e) => set("materialsStored", e.target.value)} />
          </FormField>
          <FormField label="Requested action items by client">
            <Textarea size="lg" autoresize rows={2} value={content.clientActionItems} onChange={(e) => set("clientActionItems", e.target.value)} />
          </FormField>
        </Stack>
      </Section>

      <Section title="Work in progress">
        <Stack gap="4">
          <FormField label="Summary of work progress">
            <Textarea size="lg" autoresize rows={3} value={content.workSummary} onChange={(e) => set("workSummary", e.target.value)} />
          </FormField>

          {content.items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              total={content.items.length}
              photoById={photoById}
              onChange={(patch) => setItem(item.id, patch)}
              onMove={(delta) => set("items", move(content.items, index, delta))}
              onRemove={() => set("items", content.items.filter((i) => i.id !== item.id))}
              onAddPhotos={() => setPicker({ kind: "item", itemId: item.id })}
            />
          ))}
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              set("items", [...content.items, { id: newCaItemId(), status: "in-progress", description: "", photos: [] }])
            }
          >
            <LuPlus /> Add observation item
          </Button>
        </Stack>
      </Section>

      <Section title="Comments">
        <Textarea size="lg" autoresize rows={3} aria-label="Comments" value={content.comments} onChange={(e) => set("comments", e.target.value)} />
      </Section>

      <Section title="Distribution">
        <HStack gap="6" wrap="wrap">
          {(["owner", "parkhill", "contractor"] as const).map((key) => (
            <Checkbox.Root
              key={key}
              size="lg"
              checked={content.distribution[key]}
              onCheckedChange={(e) => set("distribution", { ...content.distribution, [key]: Boolean(e.checked) })}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>{key === "parkhill" ? "Parkhill" : cap(key)}</Checkbox.Label>
            </Checkbox.Root>
          ))}
        </HStack>
      </Section>

      <CaPhotoPicker
        open={picker !== null}
        title={picker?.kind === "cover" ? "Choose the project photo" : "Add photos to this item"}
        single={picker?.kind === "cover"}
        photos={photos}
        pinNames={pinNames}
        exclude={pickerItem ? pickerItem.photos.map((p) => p.photoId) : []}
        onClose={() => setPicker(null)}
        onPick={(ids) => {
          if (picker?.kind === "cover") set("coverPhotoId", ids[0]);
          else if (pickerItem) {
            setItem(pickerItem.id, {
              photos: [
                ...pickerItem.photos,
                ...ids.map((id) => ({ photoId: id, caption: photoById.get(id)?.caption ?? "" })),
              ],
            });
          }
        }}
      />
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack as="section" gap="3" borderWidth="1px" borderColor="line" borderRadius="lg" p={{ base: 4, md: 5 }} aria-label={title}>
      <Text fontSize="sm" fontWeight="bold" color="brand.fg" textTransform="uppercase" letterSpacing="wider">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Chip({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <Button
      size="lg"
      borderRadius="full"
      variant={on ? "solid" : "outline"}
      colorPalette={on ? "brand" : "gray"}
      aria-pressed={on}
      onClick={onToggle}
    >
      {label}
    </Button>
  );
}

function ItemCard({
  item,
  index,
  total,
  photoById,
  onChange,
  onMove,
  onRemove,
  onAddPhotos,
}: {
  item: CaReportItem;
  index: number;
  total: number;
  photoById: Map<string, CaPhotoView>;
  onChange: (patch: Partial<CaReportItem>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onAddPhotos: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = `Item ${itemNumber(index)}`;

  return (
    <Stack gap="3" borderWidth="1px" borderColor={item.status === "deficient" ? "red.500" : "line"} borderRadius="md" p="3" data-testid="ca-editor-item">
      <HStack justify="space-between" gap="2">
        <Text fontWeight="bold">{label}</Text>
        <HStack gap="1">
          <IconButton aria-label={`Move ${label} up`} variant="ghost" size="lg" disabled={index === 0} onClick={() => onMove(-1)}>
            <LuArrowUp />
          </IconButton>
          <IconButton aria-label={`Move ${label} down`} variant="ghost" size="lg" disabled={index === total - 1} onClick={() => onMove(1)}>
            <LuArrowDown />
          </IconButton>
        </HStack>
      </HStack>

      <FormField label="Status">
        <NativeSelect.Root size="lg">
          <NativeSelect.Field
            aria-label={`${label} status`}
            value={item.status}
            onChange={(e) => onChange({ status: e.currentTarget.value as CaItemStatus })}
          >
            {CA_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CA_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </FormField>
      <FormField label="Description">
        <Textarea
          size="lg"
          autoresize
          rows={2}
          aria-label={`${label} description`}
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </FormField>

      <Stack gap="2">
        <Text fontWeight="medium">Photos ({item.photos.length})</Text>
        {item.photos.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            No photos: the report shows two empty photo boxes.
          </Text>
        )}
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
          {item.photos.map((photo, i) => {
            const view = photoById.get(photo.photoId);
            return (
              <Stack key={photo.photoId} gap="2" borderWidth="1px" borderColor="line" borderRadius="md" p="2">
                <AspectRatio ratio={4 / 3}>
                  <Box bg="gray.100" borderRadius="sm" overflow="hidden">
                    {view?.src ? (
                      <Image src={view.src} alt="" objectFit="contain" w="full" h="full" />
                    ) : (
                      <Text fontSize="xs" color="fg.subtle">
                        Not on this device
                      </Text>
                    )}
                  </Box>
                </AspectRatio>
                <Input
                  size="lg"
                  aria-label={`${label} photo ${i + 1} caption`}
                  placeholder="Caption"
                  value={photo.caption}
                  maxLength={1000}
                  onChange={(e) =>
                    onChange({ photos: item.photos.map((p, j) => (j === i ? { ...p, caption: e.target.value } : p)) })
                  }
                />
                <HStack justify="space-between">
                  <HStack gap="1">
                    <IconButton aria-label="Move photo earlier" variant="ghost" size="md" disabled={i === 0} onClick={() => onChange({ photos: move(item.photos, i, -1) })}>
                      <LuArrowLeft />
                    </IconButton>
                    <IconButton
                      aria-label="Move photo later"
                      variant="ghost"
                      size="md"
                      disabled={i === item.photos.length - 1}
                      onClick={() => onChange({ photos: move(item.photos, i, 1) })}
                    >
                      <LuArrowRight />
                    </IconButton>
                  </HStack>
                  <Button variant="ghost" size="md" onClick={() => onChange({ photos: item.photos.filter((_, j) => j !== i) })}>
                    <LuX /> Remove
                  </Button>
                </HStack>
              </Stack>
            );
          })}
        </SimpleGrid>
        <Button variant="outline" size="lg" alignSelf="flex-start" onClick={onAddPhotos}>
          <LuImagePlus /> Add photos
        </Button>
      </Stack>

      {confirmRemove ? (
        <HStack justify="flex-end" gap="2" wrap="wrap">
          <Text>Remove {label}?</Text>
          <Button variant="ghost" size="lg" onClick={() => setConfirmRemove(false)}>
            Keep
          </Button>
          <Button colorPalette="red" size="lg" onClick={onRemove}>
            Remove item
          </Button>
        </HStack>
      ) : (
        <Button variant="ghost" colorPalette="red" size="lg" alignSelf="flex-start" onClick={() => setConfirmRemove(true)}>
          <LuTrash2 /> Remove item
        </Button>
      )}
    </Stack>
  );
}
