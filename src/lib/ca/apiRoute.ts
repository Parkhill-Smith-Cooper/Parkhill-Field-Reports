import "server-only";

import { apiError, handleRoute } from "@/lib/apiResponse";
import { isCaError } from "@/lib/ca/contracts";
import { isValidProjectNumber } from "@/lib/validation";

/**
 * `handleRoute` for CA route handlers, adding the CA-specific error mapping:
 *
 * - `CaNotConfiguredError` → 503 with its message (a connection that has not
 *   been built yet, e.g. the CA application feed). The UI shows the message
 *   and offers the manual alternative.
 * - `CaConflictError` / `RevisionAlreadyExistsError` → 409 with its message.
 * - `MissingPhotoError` → 422 (a photo in the report has not synced yet).
 * - A bad `CA_*` setting → 500 naming the variable, like a missing CX one.
 *
 * Everything else falls through to `handleRoute`: logged, generic 500.
 */
export function caRoute(
  operation: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  return handleRoute(operation, async () => {
    try {
      return await handler();
    } catch (error) {
      // By name, not instanceof - see the note on errors in contracts.ts.
      if (isCaError(error, "CaNotConfiguredError")) {
        return apiError(error.message, 503);
      }
      if (
        isCaError(error, "CaConflictError") ||
        isCaError(error, "RevisionAlreadyExistsError")
      ) {
        return apiError(error.message, 409);
      }
      if (isCaError(error, "MissingPhotoError")) {
        return apiError(error.message, 422);
      }
      if (error instanceof Error && /^Invalid CA_[A-Z_]+=/.test(error.message)) {
        console.error(`[CA] ${operation} failed`, error);
        return apiError(error.message, 500);
      }
      throw error;
    }
  });
}

/** The project number from route params, or a 400 response. */
export async function projectParam(
  params: Promise<{ projectNumber: string }>,
): Promise<{ projectNumber: string } | { error: Response }> {
  const { projectNumber } = await params;
  if (!isValidProjectNumber(projectNumber)) {
    return { error: apiError("Invalid project number.", 400) };
  }
  return { projectNumber };
}
