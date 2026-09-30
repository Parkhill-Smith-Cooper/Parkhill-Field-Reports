import "server-only";

import type { ApiError } from "@/types";

/** Uniform error shape, so the client service layer has one thing to parse. */
export function apiError(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ApiError, { status });
}

/**
 * Wraps a route handler so an unexpected failure becomes a logged 500 with a
 * message the engineer can act on, instead of an Azure SDK stack trace
 * rendered in the UI.
 *
 * Configuration problems are called out specifically: with no local fallback
 * mode, a missing environment variable is the single most likely first-run
 * failure, and it deserves a better message than "500".
 */
export async function handleRoute(
  operation: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    console.error(`[ParkhillCXField] ${operation} failed`, error);

    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Missing required environment variable")) {
      return apiError(message, 500);
    }
    return apiError(
      `Could not ${operation}. The server logged the details.`,
      500,
    );
  }
}
