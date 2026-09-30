"use client";

import type { ApiError } from "@/types";

/**
 * The client's only door to the server.
 *
 * Every network call in the app goes through here, which is what keeps `fetch`
 * out of components and makes the error handling uniform: route handlers all
 * answer with `{ error }`, and this turns that into a thrown `Error` carrying
 * the message the engineer should read.
 */

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function toError(response: Response): Promise<ApiRequestError> {
  let message = `Request failed (${response.status}).`;
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === "string" && body.error.length > 0) {
      message = body.error;
    }
  } catch {
    // Non-JSON error body - keep the status-based message.
  }
  return new ApiRequestError(message, response.status);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    // Field data must never come from a stale cache.
    cache: "no-store",
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export async function apiPostForm<T>(
  path: string,
  form: FormData,
): Promise<T> {
  // No Content-Type header: the browser must set the multipart boundary.
  const response = await fetch(path, { method: "POST", body: form });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}
