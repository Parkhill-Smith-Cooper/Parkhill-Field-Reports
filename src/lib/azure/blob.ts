import "server-only";

import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  type ContainerClient,
  type UserDelegationKey,
} from "@azure/storage-blob";

import { env } from "@/lib/env";

import { azureCredential } from "./credential";

/**
 * Field photo storage.
 *
 * The container is private. Photos are written through the app server and read
 * back through short-lived user-delegation SAS URLs, so the browser fetches
 * image bytes straight from Blob Storage without the container ever being
 * publicly readable.
 *
 * "User delegation" means the SAS is signed with a key derived from the app's
 * managed identity rather than from an account key - which is what lets this
 * work with no secrets. It requires the **Storage Blob Delegator** role on the
 * storage account in addition to Storage Blob Data Contributor.
 */

const SAS_TTL_MINUTES = 15;

/** How long a delegation key is requested for, and how early it is replaced. */
const DELEGATION_KEY_TTL_MINUTES = 60 * 6;
const DELEGATION_KEY_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CachedDelegationKey = {
  key: UserDelegationKey;
  expiresOn: number;
};

declare global {
  var __cxFieldBlobService: BlobServiceClient | undefined;
  var __cxFieldDelegationKey: CachedDelegationKey | undefined;
}

function service(): BlobServiceClient {
  globalThis.__cxFieldBlobService ??= new BlobServiceClient(
    `https://${env.storageAccount}.blob.core.windows.net`,
    azureCredential(),
  );
  return globalThis.__cxFieldBlobService;
}

function container(): ContainerClient {
  return service().getContainerClient(env.storageContainer);
}

/** The canonical location of a field photo. Kept in one place so the upload
 *  path and every later read agree by construction. */
export function photoBlobPath(
  projectNumber: string,
  observationId: string,
  photoId: string,
): string {
  return `${projectNumber}/${observationId}/${photoId}.jpg`;
}

export async function uploadPhoto(
  blobPath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const blob = container().getBlockBlobClient(blobPath);
  await blob.uploadData(body, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      // These are immutable once written, so let the browser cache hard; the
      // SAS token in the query string is what actually expires.
      blobCacheControl: "private, max-age=31536000, immutable",
    },
  });
}

/**
 * Fetching a delegation key is a network round trip, and one key can sign any
 * number of SAS tokens for hours. Caching it turns "render a report with eight
 * photos" from nine Azure calls into one.
 */
async function delegationKey(): Promise<UserDelegationKey> {
  const cached = globalThis.__cxFieldDelegationKey;
  if (cached && cached.expiresOn - DELEGATION_KEY_REFRESH_MARGIN_MS > Date.now()) {
    return cached.key;
  }

  // Start slightly in the past to tolerate clock skew between this host and
  // the storage service.
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(
    Date.now() + DELEGATION_KEY_TTL_MINUTES * 60 * 1000,
  );

  const key = await service().getUserDelegationKey(startsOn, expiresOn);
  globalThis.__cxFieldDelegationKey = {
    key,
    expiresOn: expiresOn.getTime(),
  };
  return key;
}

/** A read-only URL for one photo, valid for a few minutes. */
export async function photoReadUrl(blobPath: string): Promise<string> {
  const key = await delegationKey();

  const sas = generateBlobSASQueryParameters(
    {
      containerName: env.storageContainer,
      blobName: blobPath,
      permissions: BlobSASPermissions.from({ read: true }),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: new Date(Date.now() + SAS_TTL_MINUTES * 60 * 1000),
      protocol: SASProtocol.Https,
    },
    key,
    env.storageAccount,
  );

  return `${container().getBlockBlobClient(blobPath).url}?${sas.toString()}`;
}

/** Seconds a client may cache a batch of read URLs. Kept below the SAS
 *  lifetime so a cached URL is never handed out after it has expired. */
export const PHOTO_URL_CACHE_SECONDS = (SAS_TTL_MINUTES - 5) * 60;
