import "server-only";

import { caConfig } from "@/lib/ca/config";
import {
  CaNotConfiguredError,
  type CaDrawingSource,
  type CaFileStore,
  type CaProjectSource,
  type CaRepository,
} from "@/lib/ca/contracts";
import { createMockFileStore } from "@/lib/ca/files/mockFileStore";

import { createMockCaRepository } from "./mockCaRepository";
import {
  caAppDrawingSource,
  caAppProjectSource,
  mockDrawingSource,
  mockProjectSource,
  vantagePointProjectSource,
} from "./sources";

/**
 * The one place that decides which implementation of each CA contract is in
 * use, from `src/lib/ca/config.ts`. Route handlers call these getters and
 * never construct an implementation themselves.
 *
 * Instances are cached on `globalThis`, as the CX Cosmos client is, so dev hot
 * reload does not reset the mock store on every edit.
 */

declare global {
  var __caRepository: CaRepository | undefined;
  var __caFileStore: CaFileStore | undefined;
}

export function getCaRepository(): CaRepository {
  if (globalThis.__caRepository) return globalThis.__caRepository;

  if (caConfig.dataMode === "mock") {
    globalThis.__caRepository = createMockCaRepository({
      dataDir: caConfig.mockDataDir,
    });
    return globalThis.__caRepository;
  }

  // TODO(Marcelo / Phase 5): Cosmos implementation of CaRepository.
  throw new CaNotConfiguredError(
    "CA_DATA_MODE=azure is not available yet: the Cosmos implementation of the " +
      "CA repository has not been connected. Use CA_DATA_MODE=mock in development.",
  );
}

export function getCaFileStore(): CaFileStore {
  if (globalThis.__caFileStore) return globalThis.__caFileStore;

  if (caConfig.dataMode === "mock") {
    globalThis.__caFileStore = createMockFileStore({
      dataDir: caConfig.mockDataDir,
    });
    return globalThis.__caFileStore;
  }

  // TODO(Marcelo / Phase 5): Blob implementation of CaFileStore.
  throw new CaNotConfiguredError(
    "CA_DATA_MODE=azure is not available yet: the Blob implementation of the " +
      "CA file store has not been connected.",
  );
}

/** `null` when no upstream project source is configured (manual entry only). */
export function getCaProjectSource(): CaProjectSource | null {
  switch (caConfig.projectSource) {
    case "mock":
      return mockProjectSource;
    case "vantagepoint":
      return vantagePointProjectSource;
    case "ca-app":
      return caAppProjectSource;
    case "none":
      return null;
  }
}

/** `null` when no upstream drawing source is configured (upload only). */
export function getCaDrawingSource(): CaDrawingSource | null {
  switch (caConfig.drawingSource) {
    case "mock":
      return mockDrawingSource;
    case "ca-app":
      return caAppDrawingSource;
    case "none":
      return null;
  }
}

/** What the UI needs to know about the current wiring (no secrets). */
export function caRuntimeInfo() {
  return {
    dataMode: caConfig.dataMode,
    projectSource: caConfig.projectSource,
    drawingSource: caConfig.drawingSource,
  };
}
