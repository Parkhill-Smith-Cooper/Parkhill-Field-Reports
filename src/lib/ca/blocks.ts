import { SET_BLOCK_BYTES } from "@/lib/ca/sheetIndex";

/**
 * Reads a stream (or bytes) in file-store blocks, so a large PDF copied from
 * the CA application is passed through without being held in memory. Used by
 * the drawing-set and specification syncs.
 */
export async function* blocksOf(bytes: Uint8Array | ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  if (bytes instanceof Uint8Array) {
    for (let i = 0; i < bytes.length; i += SET_BLOCK_BYTES) yield bytes.subarray(i, i + SET_BLOCK_BYTES);
    return;
  }
  const reader = bytes.getReader();
  let buffer = new Uint8Array(SET_BLOCK_BYTES);
  let filled = 0;
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(SET_BLOCK_BYTES - filled, value.length - offset);
        buffer.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === SET_BLOCK_BYTES) {
          yield buffer;
          buffer = new Uint8Array(SET_BLOCK_BYTES);
          filled = 0;
        }
      }
    }
    if (filled > 0) yield buffer.subarray(0, filled);
  } finally {
    // Stopped early (not a PDF, too large): close the upstream download.
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
