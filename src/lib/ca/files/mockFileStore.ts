import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import type { CaFileStore } from "@/lib/ca/contracts";
import { isSafeFilePath } from "@/lib/ca/paths";

/**
 * MOCK file store — development and tests only.
 *
 * Keeps CA photos and drawings on the local disk under `<dataDir>/files`, or
 * in memory when `dataDir` is `null`. Files are served back to the signed-in
 * browser by `/api/ca/files/[...path]`, which stands in for the short-lived
 * SAS URLs the Azure implementation will issue.
 */
export function createMockFileStore(options: {
  dataDir: string | null;
}): CaFileStore {
  const root = options.dataDir
    ? path.resolve(options.dataDir, "files")
    : null;
  const memory = new Map<string, { bytes: Uint8Array; contentType: string }>();

  function resolve(filePath: string): string {
    if (!isSafeFilePath(filePath)) {
      throw new Error(`Refusing unsafe file path ${JSON.stringify(filePath)}.`);
    }
    const full = path.resolve(root!, ...filePath.split("/"));
    // Belt and braces: the pattern check already rules out traversal.
    if (!full.startsWith(root! + path.sep)) {
      throw new Error(`Refusing file path outside the store.`);
    }
    return full;
  }

  async function exists(filePath: string): Promise<boolean> {
    if (!root) {
      if (!isSafeFilePath(filePath)) return false;
      return memory.has(filePath);
    }
    try {
      await fs.access(resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  return {
    kind: "mock",

    async put(filePath, bytes, contentType) {
      if (!isSafeFilePath(filePath)) {
        throw new Error(`Refusing unsafe file path ${JSON.stringify(filePath)}.`);
      }
      // Immutable, like the Azure store: a retried upload of the same file
      // is a no-op rather than an overwrite.
      if (await exists(filePath)) return;
      if (!root) {
        memory.set(filePath, { bytes: new Uint8Array(bytes), contentType });
        return;
      }
      const full = resolve(filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      await fs.writeFile(`${full}.type`, contentType);
    },

    exists,

    async get(filePath) {
      if (!root) {
        const entry = isSafeFilePath(filePath) ? memory.get(filePath) : undefined;
        return entry ? { bytes: entry.bytes, contentType: entry.contentType } : null;
      }
      try {
        const full = resolve(filePath);
        const [bytes, contentType] = await Promise.all([
          fs.readFile(full),
          fs.readFile(`${full}.type`, "utf8").catch(() => "application/octet-stream"),
        ]);
        return { bytes: new Uint8Array(bytes), contentType };
      } catch {
        return null;
      }
    },

    async readUrl(filePath) {
      return `/api/ca/files/${filePath.split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}
