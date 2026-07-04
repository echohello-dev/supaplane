import { z } from "zod";

/**
 * Relay-only pairing offer v2.
 *
 * Encoded as `https://app.supaplane.com/#offer=<base64url-JSON>` and printed as a QR.
 *
 * The client derives the shared secret with `daemonPublicKeyB64` via Curve25519 ECDH
 * (tweetnacl `box.before`) and connects to the relay endpoint over WebSocket. All
 * subsequent traffic is encrypted client-side; the relay sees only ciphertext.
 *
 * `serverId` is the stable identifier for this daemon's home directory and is also
 * used as the relay session identifier. Clients pin it on first use (TOFU).
 */
export const ConnectionOfferV2Schema = z.object({
  v: z.literal(2),
  serverId: z.string().min(1),
  daemonPublicKeyB64: z.string().min(1),
  relay: z.object({
    endpoint: z.string().min(1),
    useTls: z.boolean().optional(),
  }),
  daemon: z
    .object({
      label: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  issuedAt: z.number().int().nonnegative().optional(),
});

export type ConnectionOfferV2 = z.infer<typeof ConnectionOfferV2Schema>;
export type ConnectionOffer = ConnectionOfferV2;

const OFFER_FRAGMENT_PREFIX = "#offer=";

function decodeBase64UrlToUtf8(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeOfferFragmentPayload(encoded: string): unknown {
  const json = decodeBase64UrlToUtf8(encoded);
  return JSON.parse(json) as unknown;
}

function extractOfferFragmentEncoded(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fragmentIndex = trimmed.indexOf(OFFER_FRAGMENT_PREFIX);
  if (fragmentIndex === -1) return null;
  const encoded = trimmed.slice(fragmentIndex + OFFER_FRAGMENT_PREFIX.length).trim();
  return encoded.length > 0 ? encoded : null;
}

/**
 * Parse a pairing-offer URL of the form `https://app.supaplane.com/#offer=<base64url>`.
 *
 * Returns `null` if the input has no `#offer=` fragment. Throws if the fragment
 * exists but the payload is malformed or fails schema validation.
 */
export function parseConnectionOfferFromUrl(input: string): ConnectionOfferV2 | null {
  const encoded = extractOfferFragmentEncoded(input);
  if (!encoded) return null;
  const payload = decodeOfferFragmentPayload(encoded);
  return ConnectionOfferV2Schema.parse(payload);
}

export interface BuildOfferUrlArgs {
  offer: ConnectionOfferV2;
  appBaseUrl: string;
}

export function encodeOfferToFragmentUrl(args: BuildOfferUrlArgs): string {
  const json = JSON.stringify(args.offer);
  const encoded = encodeBase64Url(json);
  return `${args.appBaseUrl.replace(/\/$/, "")}/${OFFER_FRAGMENT_PREFIX}${encoded}`;
}
