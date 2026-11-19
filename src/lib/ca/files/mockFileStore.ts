import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { MissingBlockError, type CaFileStore } from "@/lib/ca/contracts";
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
  /** Staged blocks of large uploads, in memory mode. */
  const memoryBlocks = new Map<string, Map<number, Uint8Array>>();

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

  async function fileExists(full: string): Promise<boolean> {
    try {
      await fs.access(full);
      return true;
    } catch {
      return false;
    }
  }

  /** Blocks are staged beside the file, in `<file>.blocks/<index>`. */
  const blockDir = (filePath: string) => `${resolve(filePath)}.blocks`;

  async function put(filePath: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (!isSafeFilePath(filePath)) {
      throw new Error(`Refusing unsafe file path ${JSON.stringify(filePath)}.`);
    }
    // Immutable, like the Azure store: the first upload of a path wins and
    // any later (or concurrent) upload of it is a no-op, never an overwrite.
    if (!root) {
      // Check-and-set with no await in between, so it cannot interleave.
      if (!memory.has(filePath)) {
        memory.set(filePath, { bytes: new Uint8Array(bytes), contentType });
      }
      return;
    }
    const full = resolve(filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // Write the complete file under a unique temporary name, then hard-link
    // it into place. link() is atomic and create-only (EEXIST if the path is
    // taken), so readers never see a partial file and two concurrent first
    // uploads cannot both win.
    const tmp = `${full}.${randomUUID()}.tmp`;
    let created = false;
    try {
      await fs.writeFile(tmp, bytes, { flag: "wx" });
      try {
        await fs.link(tmp, full);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    } finally {
      await fs.rm(tmp, { force: true });
    }
    // The content-type sidecar belongs to whichever upload created the file.
    // The winner writes it; a retry fills it in only if the winner never got
    // that far (create-only, so it never replaces the winner's).
    if (created || !(await fileExists(`${full}.type`))) {
      await fs.writeFile(`${full}.type`, contentType, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    }
  }

  return {
    kind: "mock",

    put,

    exists,

    async stageBlock(filePath, index, bytes) {
      if (!isSafeFilePath(filePath)) throw new Error(`Refusing unsafe file path ${JSON.stringify(filePath)}.`);
      if (await exists(filePath)) return;
      if (!root) {
        const blocks = memoryBlocks.get(filePath) ?? new Map<number, Uint8Array>();
        blocks.set(index, new Uint8Array(bytes));
        memoryBlocks.set(filePath, blocks);
        return;
      }
      const dir = blockDir(filePath);
      await fs.mkdir(dir, { recursive: true });
      const tmp = path.join(dir, `${index}.${randomUUID()}.tmp`);
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, path.join(dir, String(index)));
    },

    async commitBlocks(filePath, blockCount, contentType) {
      if (!isSafeFilePath(filePath)) throw new Error(`Refusing unsafe file path ${JSON.stringify(filePath)}.`);
      if (!(await exists(filePath))) {
        const parts: Uint8Array[] = [];
        for (let i = 0; i < blockCount; i++) {
          const block = root
            ? await fs.readFile(path.join(blockDir(filePath), String(i))).catch(() => null)
            : memoryBlocks.get(filePath)?.get(i);
          if (!block) throw new MissingBlockError();
          parts.push(new Uint8Array(block));
        }
        const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        await put(filePath, bytes, contentType);
      }
      if (root) await fs.rm(blockDir(filePath), { recursive: true, force: true });
      else memoryBlocks.delete(filePath);
      const sizeBytes = root ? (await fs.stat(resolve(filePath))).size : (memory.get(filePath)?.bytes.length ?? 0);
      return { sizeBytes };
    },

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
