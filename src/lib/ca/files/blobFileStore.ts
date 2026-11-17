import "server-only";

import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  type ContainerClient,
  type UserDelegationKey,
} from "@azure/storage-blob";

import { azureCredential } from "@/lib/azure/credential";
import type { CaFileStore } from "@/lib/ca/contracts";
import { isSafeFilePath } from "@/lib/ca/paths";

/**
 * AZURE CA file store (Blob Storage) for photos and drawing sheets.
 *
 * NOT YET RUN AGAINST A REAL STORAGE ACCOUNT. Same approach as the CX photo
 * store (src/lib/azure/blob.ts, left untouched): managed identity, private
 * container, reads through short-lived user-delegation SAS URLs. It uses its
 * own container (`AZURE_STORAGE_CA_CONTAINER`, default `ca-files`) in the
 * existing storage account (`AZURE_STORAGE_ACCOUNT`).
 *
 * Files are immutable: `put` uses an "if none match *" condition, so an
 * existing path is never overwritten (a retried upload is a no-op, as in mock
 * mode).
 *
 * Needs, on the storage account: Storage Blob Data Contributor and Storage
 * Blob Delegator for the app's identity, and a CORS rule allowing GET from
 * the app's origin - the browser downloads drawing sheets with `fetch` to
 * keep them for offline use (photos shown in <img> do not need CORS).
 */

const SAS_TTL_MINUTES = 15;
const DELEGATION_KEY_TTL_MINUTES = 60 * 6;
const DELEGATION_KEY_REFRESH_MARGIN_MS = 5 * 60 * 1000;

declare global {
  var __caBlobService: BlobServiceClient | undefined;
  var __caDelegationKey: { key: UserDelegationKey; expiresOn: number } | undefined;
}

function status(error: unknown): number | undefined {
  const s = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === "number" ? s : undefined;
}

export function createBlobFileStore(options: { account: string; container: string }): CaFileStore {
  const service = () => {
    globalThis.__caBlobService ??= new BlobServiceClient(
      `https://${options.account}.blob.core.windows.net`,
      azureCredential(),
    );
    return globalThis.__caBlobService;
  };
  const container = (): ContainerClient => service().getContainerClient(options.container);

  function checked(path: string): string {
    if (!isSafeFilePath(path)) throw new Error(`Refusing unsafe file path ${JSON.stringify(path)}.`);
    return path;
  }

  async function delegationKey(): Promise<UserDelegationKey> {
    const cached = globalThis.__caDelegationKey;
    if (cached && cached.expiresOn - DELEGATION_KEY_REFRESH_MARGIN_MS > Date.now()) return cached.key;
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + DELEGATION_KEY_TTL_MINUTES * 60 * 1000);
    const key = await service().getUserDelegationKey(startsOn, expiresOn);
    globalThis.__caDelegationKey = { key, expiresOn: expiresOn.getTime() };
    return key;
  }

  return {
    kind: "azure",

    async put(path, bytes, contentType) {
      const blob = container().getBlockBlobClient(checked(path));
      try {
        await blob.uploadData(bytes, {
          blobHTTPHeaders: {
            blobContentType: contentType,
            blobCacheControl: "private, max-age=31536000, immutable",
          },
          conditions: { ifNoneMatch: "*" },
        });
      } catch (error) {
        // Already there: files are immutable, so a retried upload is a no-op.
        if (status(error) === 409 || status(error) === 412) return;
        throw error;
      }
    },

    async exists(path) {
      return container().getBlobClient(checked(path)).exists();
    },

    async get(path) {
      const blob = container().getBlobClient(checked(path));
      try {
        const props = await blob.getProperties();
        const bytes = await blob.downloadToBuffer();
        return { bytes: new Uint8Array(bytes), contentType: props.contentType ?? "application/octet-stream" };
      } catch (error) {
        if (status(error) === 404) return null;
        throw error;
      }
    },

    async readUrl(path) {
      const key = await delegationKey();
      const sas = generateBlobSASQueryParameters(
        {
          containerName: options.container,
          blobName: checked(path),
          permissions: BlobSASPermissions.from({ read: true }),
          startsOn: new Date(Date.now() - 5 * 60 * 1000),
          expiresOn: new Date(Date.now() + SAS_TTL_MINUTES * 60 * 1000),
          protocol: SASProtocol.Https,
        },
        key,
        options.account,
      );
      return `${container().getBlockBlobClient(path).url}?${sas.toString()}`;
    },
  };
}
