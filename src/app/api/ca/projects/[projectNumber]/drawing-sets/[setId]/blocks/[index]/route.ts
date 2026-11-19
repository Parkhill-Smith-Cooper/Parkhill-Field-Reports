import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { setParams } from "@/lib/ca/drawingSets";
import { caDrawingSetPath } from "@/lib/ca/paths";
import { MAX_SET_BLOCKS, SET_BLOCK_BYTES } from "@/lib/ca/sheetIndex";
import { getCaFileStore } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string; setId: string; index: string }> };

/**
 * `PUT /api/ca/projects/{p}/drawing-sets/{setId}/blocks/{index}` — one block
 * (at most 8 MB, multipart field `block`) of a drawing-set PDF. Blocks stay
 * invisible until `PUT .../drawing-sets/{setId}` commits them. Re-sending a
 * block replaces it, so a failed upload can simply be retried.
 */
export async function PUT(request: Request, { params }: Params) {
  return caRoute("upload the drawing set", async () => {
    const p = await setParams(params);
    if ("error" in p) return p.error;
    const { index: raw } = await params;
    const index = Number(raw);
    if (!/^\d{1,3}$/.test(raw) || index >= MAX_SET_BLOCKS) return apiError("Invalid block.", 400);

    const form = await request.formData().catch(() => null);
    const block = form?.get("block");
    if (!(block instanceof File)) return apiError("Include the block.", 400);
    if (block.size === 0 || block.size > SET_BLOCK_BYTES) return apiError("Invalid block size.", 413);

    const bytes = new Uint8Array(await block.arrayBuffer());
    if (index === 0 && new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return apiError("Drawing sets must be PDF files.", 415);
    }
    await getCaFileStore().stageBlock(caDrawingSetPath(p.projectNumber, p.setId), index, bytes);
    return Response.json({ ok: true });
  });
}
