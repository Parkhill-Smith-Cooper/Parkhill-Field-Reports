"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { newItemId, newObservationId } from "@/lib/ids";
import { clearSession, readSession, writeSession } from "@/lib/sessionStore";
import type {
  ObservationForm,
  ObservationPhoto,
  SelectableItem,
} from "@/types";

/**
 * The in-progress observation.
 *
 * Mounted in the wizard layout, so client-side navigation between the four
 * steps never remounts it and Step 1 data is still present on Step 4. Nothing
 * here is written to Cosmos until the engineer saves on Step 4 - photos are
 * the exception, since they are uploaded to Blob Storage as soon as they are
 * chosen so that a lost session cannot lose the pictures.
 */

export type ObservationDraft = {
  /** Generated once, up front: the blob path of the first photo upload has to
   *  be final long before Step 4 exists. */
  observationId: string;
  form: ObservationForm;
  photos: ObservationPhoto[];
  causes: SelectableItem[];
  actions: SelectableItem[];
};

type DraftContextValue = {
  draft: ObservationDraft;
  /** False until the session mirror has been read. Guards must wait for this. */
  hydrated: boolean;
  setField: (field: keyof ObservationForm, value: string) => void;
  addPhoto: (photo: ObservationPhoto) => void;
  removePhoto: (photoId: string) => void;
  setCauses: (causes: SelectableItem[]) => void;
  setActions: (actions: SelectableItem[]) => void;
  toggleCause: (id: string) => void;
  toggleAction: (id: string) => void;
  addCustomCause: (text: string) => void;
  addCustomAction: (text: string) => void;
  editCause: (id: string, text: string) => void;
  editAction: (id: string, text: string) => void;
  removeCause: (id: string) => void;
  removeAction: (id: string) => void;
  /** Starts a fresh observation and clears the session mirror. */
  reset: () => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

function today(): string {
  // Local date, not UTC: an observation made at 7pm in Texas is dated that
  // day, not the next one.
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyDraft(): ObservationDraft {
  return {
    observationId: newObservationId(),
    form: {
      equipment: "",
      system: "",
      location: "",
      activity: "",
      observation: "",
      observedDate: today(),
    },
    photos: [],
    causes: [],
    actions: [],
  };
}

function sessionKey(projectNumber: string): string {
  return `cxfield:draft:${projectNumber}`;
}

/** Rejects a mirrored draft that does not match the current shape, so an old
 *  entry left by a previous version of the app cannot crash the wizard. */
function isDraft(value: unknown): value is ObservationDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<ObservationDraft>;
  return (
    typeof draft.observationId === "string" &&
    typeof draft.form === "object" &&
    draft.form !== null &&
    typeof draft.form.equipment === "string" &&
    typeof draft.form.observedDate === "string" &&
    Array.isArray(draft.photos) &&
    Array.isArray(draft.causes) &&
    Array.isArray(draft.actions)
  );
}

export function ObservationDraftProvider({
  projectNumber,
  children,
}: {
  projectNumber: string;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<ObservationDraft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const key = sessionKey(projectNumber);

  // Hydrate after mount rather than during render. Reading sessionStorage in
  // the initial state would make the client's first render disagree with the
  // server-rendered HTML, which is a hydration mismatch; the browser store
  // simply is not readable at the point React needs the initial value.
  //
  // This is the one place the app sets state synchronously in an effect. The
  // lint rule guards against cascading renders, and one extra render on mount
  // is the deliberate, understood cost of reading a browser-only store safely.
  useEffect(() => {
    const stored = readSession<unknown>(key);
    if (isDraft(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(stored);
    }
    setHydrated(true);
  }, [key]);

  // Mirror every change so a backgrounded tab or an accidental reload in the
  // field does not lose the engineer's notes. Photo *metadata* only - the
  // bytes are already in Blob Storage, and they would blow the storage quota.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    // Skip the write immediately after hydration; it would only re-persist
    // what was just read.
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    writeSession(key, draft);
  }, [draft, hydrated, key]);

  const setField = useCallback(
    (field: keyof ObservationForm, value: string) => {
      setDraft((current) => ({
        ...current,
        form: { ...current.form, [field]: value },
      }));
    },
    [],
  );

  const addPhoto = useCallback((photo: ObservationPhoto) => {
    setDraft((current) => ({ ...current, photos: [...current.photos, photo] }));
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    setDraft((current) => ({
      ...current,
      // The blob is intentionally left in place: deleting it here would make
      // an accidental tap unrecoverable, and orphans are cleaned up by a
      // separate job (see "Known follow-ups" in the README).
      photos: current.photos.filter((photo) => photo.id !== photoId),
    }));
  }, []);

  const setCauses = useCallback((causes: SelectableItem[]) => {
    setDraft((current) => ({ ...current, causes }));
  }, []);

  const setActions = useCallback((actions: SelectableItem[]) => {
    setDraft((current) => ({ ...current, actions }));
  }, []);

  /**
   * The six item operations below are identical for causes and actions, so
   * they are generated from one implementation rather than written twice.
   */
  const itemOps = useMemo(() => {
    function make(listKey: "causes" | "actions") {
      return {
        toggle: (id: string) =>
          setDraft((current) => ({
            ...current,
            [listKey]: current[listKey].map((item) =>
              item.id === id ? { ...item, selected: !item.selected } : item,
            ),
          })),
        addCustom: (text: string) =>
          setDraft((current) => ({
            ...current,
            [listKey]: [
              ...current[listKey],
              {
                id: newItemId(),
                text: text.trim(),
                // An item the engineer just typed is selected: they would not
                // have typed it otherwise.
                selected: true,
                isCustom: true,
              },
            ],
          })),
        edit: (id: string, text: string) =>
          setDraft((current) => ({
            ...current,
            [listKey]: current[listKey].map((item) =>
              item.id === id ? { ...item, text } : item,
            ),
          })),
        remove: (id: string) =>
          setDraft((current) => ({
            ...current,
            [listKey]: current[listKey].filter((item) => item.id !== id),
          })),
      };
    }
    return { causes: make("causes"), actions: make("actions") };
  }, []);

  const reset = useCallback(() => {
    clearSession(key);
    hasHydrated.current = true;
    setDraft(emptyDraft());
  }, [key]);

  const value = useMemo<DraftContextValue>(
    () => ({
      draft,
      hydrated,
      setField,
      addPhoto,
      removePhoto,
      setCauses,
      setActions,
      toggleCause: itemOps.causes.toggle,
      toggleAction: itemOps.actions.toggle,
      addCustomCause: itemOps.causes.addCustom,
      addCustomAction: itemOps.actions.addCustom,
      editCause: itemOps.causes.edit,
      editAction: itemOps.actions.edit,
      removeCause: itemOps.causes.remove,
      removeAction: itemOps.actions.remove,
      reset,
    }),
    [draft, hydrated, setField, addPhoto, removePhoto, setCauses, setActions, itemOps, reset],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useObservationDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error(
      "useObservationDraft must be used inside the observation wizard layout.",
    );
  }
  return context;
}
