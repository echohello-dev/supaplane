import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const SERVER_ID_FILENAME = "server-id";
const SERVER_ID_PREFIX = "srv_";

/**
 * The stable identifier for this daemon's home directory. Also used as the
 * relay session identifier and TOFU anchor for remote clients.
 *
 * Generated lazily on first read.
 */
export function getOrCreateServerId(supaplaneHome: string): string {
  mkdirSync(supaplaneHome, { recursive: true });
  const filePath = join(supaplaneHome, SERVER_ID_FILENAME);
  if (existsSync(filePath)) {
    const value = readFileSync(filePath, "utf8").trim();
    if (value.startsWith(SERVER_ID_PREFIX) && value.length > SERVER_ID_PREFIX.length + 8) {
      return value;
    }
  }
  const id = `${SERVER_ID_PREFIX}${randomBytes(12).toString("base64url")}`;
  writeFileSync(filePath, id, { encoding: "utf8", mode: 0o600 });
  return id;
}
