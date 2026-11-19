import "server-only";

import { caConfig } from "@/lib/ca/config";
import {
  type CaDrawingSource,
  type CaFileStore,
  type CaProjectSource,
  type CaRepository,
  type CaSpecSource,
} from "@/lib/ca/contracts";
import { databaseContainer } from "@/lib/azure/cosmos";
import { createBlobFileStore } from "@/lib/ca/files/blobFileStore";
import { createMockFileStore } from "@/lib/ca/files/mockFileStore";
import type { DrawingSyncDeps } from "@/lib/ca/drawingSync";
import type { SpecSyncDeps } from "@/lib/ca/specSync";
import { env } from "@/lib/env";

import { createCosmosCaRepository, type CosmosContainerLike } from "./cosmosCaRepository";
import { createMockCaRepository } from "./mockCaRepository";
import {
  caAppDrawingSource,
  caAppProjectSource,
  caAppSpecSource,
  mockDrawingSource,
  mockProjectSource,
  mockSpecSource,
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

  // Azure (Cosmos). Built and unit-tested against a stand-in only; see
  // cosmosCaRepository.ts and docs/ca-integration-contracts.md before use.
  globalThis.__caRepository = createCosmosCaRepository({
    projects: databaseContainer(caConfig.cosmosProjectsContainer) as unknown as CosmosContainerLike,
    capture: databaseContainer(caConfig.cosmosCaptureContainer) as unknown as CosmosContainerLike,
    drawings: databaseContainer(caConfig.cosmosDrawingsContainer) as unknown as CosmosContainerLike,
    reports: databaseContainer(caConfig.cosmosReportsContainer) as unknown as CosmosContainerLike,
  });
  return globalThis.__caRepository;
}

export function getCaFileStore(): CaFileStore {
  if (globalThis.__caFileStore) return globalThis.__caFileStore;

  if (caConfig.dataMode === "mock") {
    globalThis.__caFileStore = createMockFileStore({
      dataDir: caConfig.mockDataDir,
    });
    return globalThis.__caFileStore;
  }

  // Azure (Blob). Not yet run against a real storage account.
  globalThis.__caFileStore = createBlobFileStore({
    account: env.storageAccount,
    container: caConfig.storageContainer,
  });
  return globalThis.__caFileStore;
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

/** Used when the project source fails; `null` when there is no fallback. */
export function getCaProjectFallbackSource(): CaProjectSource | null {
  switch (caConfig.projectFallbackSource) {
    case "vantagepoint":
      return vantagePointProjectSource;
    case "mock":
      return mockProjectSource;
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

/**
 * Specifications come from the same Document Control as drawings, so they
 * follow `CA_DRAWING_SOURCE`. `null` when there is none.
 */
export function getCaSpecSource(): CaSpecSource | null {
  switch (caConfig.drawingSource) {
    case "mock":
      return mockSpecSource;
    case "ca-app":
      return caAppSpecSource;
    case "none":
      return null;
  }
}

/** What the UI needs to know about the current wiring (no secrets). */
export function caRuntimeInfo() {
  return {
    dataMode: caConfig.dataMode,
    projectSource: caConfig.projectSource,
    projectFallbackSource: caConfig.projectFallbackSource,
    drawingSource: caConfig.drawingSource,
  };
}

/** What the drawing sync (`src/lib/ca/drawingSync.ts`) works with. */
export function caDrawingSyncDeps(): DrawingSyncDeps {
  return { repo: getCaRepository(), files: getCaFileStore(), source: getCaDrawingSource() };
}

/** What the specification sync (`src/lib/ca/specSync.ts`) works with. */
export function caSpecSyncDeps(): SpecSyncDeps {
  return { repo: getCaRepository(), files: getCaFileStore(), source: getCaSpecSource() };
}
