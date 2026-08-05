import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { PersistenceHandle } from "./agent-sdk-types.js";

/**
 * Persists `PersistenceHandle`s to disk so sessions can be resumed across
 * daemon restarts. Layout: `<supaplaneHome>/agents/<sanitized-cwd>/<session-id>.json`.
 */
export class HandleStore {
  readonly #home: string;

  constructor(supaplaneHome: string) {
    this.#home = supaplaneHome;
  }

  async save(cwd: string, handle: PersistenceHandle): Promise<void> {
    const dir = this.#dirFor(cwd);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${handle.sessionId}.json`);
    await writeFile(path, JSON.stringify(handle, null, 2), "utf8");
  }

  async load(cwd: string, provider: string, sessionId: string): Promise<PersistenceHandle | null> {
    const path = join(this.#dirFor(cwd), `${sessionId}.json`);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.provider !== provider || record.sessionId !== sessionId) return null;
    const handle: PersistenceHandle = { provider, sessionId };
    if (typeof record.metadata === "object" && record.metadata !== null) {
      handle.metadata = record.metadata as Record<string, unknown>;
    }
    return handle;
  }

  #dirFor(cwd: string): string {
    return join(this.#home, "agents", sanitizeCwd(cwd));
  }
}

export function sanitizeCwd(cwd: string): string {
  return (
    cwd
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "root"
  );
}
