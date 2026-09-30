"use client";

import { useEffect, useState } from "react";

import { notifyError } from "@/components/ui/toaster";
import { fetchPhotoUrls } from "@/services/photoService";

/**
 * Resolves blob paths to short-lived read URLs, keyed by path.
 *
 * Requested as a single batch: a report with eight photos costs one round trip
 * rather than eight, and the whole set then expires together. Shared by the
 * upload thumbnails and the report preview so both behave identically.
 */
export function usePhotoUrls(
  projectNumber: string,
  blobPaths: string[],
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // A stable key derived from the contents, so the effect re-runs when the set
  // of photos actually changes rather than on every render that happens to
  // produce a new array instance.
  const key = blobPaths.join("|");

  useEffect(() => {
    if (key.length === 0) return;

    let active = true;
    fetchPhotoUrls(projectNumber, key.split("|"))
      .then((result) => {
        if (active) setUrls(result);
      })
      .catch((error: unknown) => {
        if (active) notifyError("Could not load the photos", error);
      });

    return () => {
      active = false;
    };
  }, [projectNumber, key]);

  // Derived rather than stored: with no photos the answer is always the empty
  // map, so there is nothing for an effect to reset.
  return key.length === 0 ? {} : urls;
}
