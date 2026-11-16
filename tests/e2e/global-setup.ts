import fs from "node:fs";
import path from "node:path";

/**
 * Each e2e run starts from an empty CA mock store. Only the e2e directory is
 * removed; a developer's own `.ca-dev-data` is left alone.
 *
 * If a dev server on port 3100 is being reused, it holds the store in memory,
 * so restart it for a truly clean run.
 */
export default function globalSetup() {
  fs.rmSync(path.resolve(".ca-dev-data/e2e"), { recursive: true, force: true });
}
