/**
 * Helpers for building relay WebSocket URLs from the
 * `relay: { endpoint, useTls }` shape that appears in ConnectionOfferV2.
 *
 * `endpoint` is "host:port" or "host" (port defaults to 443 when useTls, 80 otherwise).
 */

export interface BuildRelayWebSocketUrlArgs {
  endpoint: string;
  useTls?: boolean;
  path?: string;
}

export function buildRelayWebSocketUrl(args: BuildRelayWebSocketUrlArgs): string {
  const { endpoint, useTls } = args;
  const path = args.path ?? "/";
  const tls = useTls ?? (endpoint.endsWith(":443") || !endpoint.includes(":"));
  const [host, portRaw] = endpoint.split(":");
  if (!host) {
    throw new Error(`Invalid relay endpoint: "${endpoint}"`);
  }
  const port = portRaw ?? (tls ? "443" : "80");
  const scheme = tls ? "wss" : "ws";
  return `${scheme}://${host}:${port}${path.startsWith("/") ? path : `/${path}`}`;
}
