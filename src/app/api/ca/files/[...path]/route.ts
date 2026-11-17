import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { isSafeFilePath } from "@/lib/ca/paths";
import { isValidProjectNumber } from "@/lib/validation";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";

/**
 * MOCK MODE ONLY: serves CA photos and drawings from the local mock file
 * store to the signed-in browser. In Azure mode, `readUrl` returns
 * short-lived Blob SAS URLs instead and this route answers 404.
 *
 * Signed-in only (src/proxy.ts), path-checked, and the file must belong to a
 * project that exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return caRoute("load the file", async () => {
    const store = getCaFileStore();
    if (store.kind !== "mock") return apiError("Not found.", 404);

    const { path: segments } = await params;
    const filePath = segments.map((s) => decodeURIComponent(s)).join("/");
    const projectNumber = segments[0] ? decodeURIComponent(segments[0]) : "";
    if (!isSafeFilePath(filePath) || !isValidProjectNumber(projectNumber)) {
      return apiError("Not found.", 404);
    }
    if (!(await getCaRepository().projects.get(projectNumber))) {
      return apiError("Not found.", 404);
    }

    const file = await store.get(filePath);
    if (!file) return apiError("Not found.", 404);

    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        // Files are immutable once written (the path contains a unique id).
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // SVG drawings must never run script in the app's origin.
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      },
    });
  });
}
