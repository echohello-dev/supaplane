import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

/**
 * NaCl box (Curve25519 ECDH + XSalsa20-Poly1305) keypair for the daemon's
 * E2E-encrypted relay channel. Generated lazily on first read, stored at
 * `daemon-keypair.json` with 0600 permissions.
 *
 * TODO(post-MVP): wire `tweetnacl` and replace the placeholder keypair with
 * a real `nacl.box.keyPair()`. The shape will not change.
 */

const KEYPAIR_FILENAME = "daemon-keypair.json";

const KeyPairSchema = z.object({
  v: z.literal(1),
  publicKeyB64: z.string().min(1),
  secretKeyB64: z.string().min(1),
  fingerprint: z.string().min(1),
});

export type StoredKeyPair = z.infer<typeof KeyPairSchema>;

export interface DaemonKeyPair {
  publicKeyB64: string;
  secretKeyB64: string;
  fingerprint: string;
}

function placeholderKeyPair(): DaemonKeyPair {
  const seed = randomBytes(32);
  const publicKey = createHash("sha256").update(seed).digest();
  const secretKey = seed;
  const publicKeyB64 = publicKey.toString("base64");
  const secretKeyB64 = secretKey.toString("base64");
  const fingerprint = createHash("sha256").update(publicKey).digest("hex").slice(0, 32);
  return { publicKeyB64, secretKeyB64, fingerprint };
}

export function loadOrCreateDaemonKeyPair(supaplaneHome: string): DaemonKeyPair {
  mkdirSync(supaplaneHome, { recursive: true });
  const filePath = join(supaplaneHome, KEYPAIR_FILENAME);
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      const parsed = KeyPairSchema.parse(raw);
      return {
        publicKeyB64: parsed.publicKeyB64,
        secretKeyB64: parsed.secretKeyB64,
        fingerprint: parsed.fingerprint,
      };
    } catch {
      // Corrupt or old — regenerate.
    }
  }
  const kp = placeholderKeyPair();
  const stored: StoredKeyPair = {
    v: 1,
    publicKeyB64: kp.publicKeyB64,
    secretKeyB64: kp.secretKeyB64,
    fingerprint: kp.fingerprint,
  };
  writeFileSync(filePath, JSON.stringify(stored, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return kp;
}
