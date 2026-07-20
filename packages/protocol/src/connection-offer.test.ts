import { describe, expect, it } from "vitest";
import {
  ConnectionOfferV2Schema,
  encodeOfferToFragmentUrl,
  parseConnectionOfferFromUrl,
} from "../src/connection-offer.js";

const SAMPLE_OFFER = {
  v: 2 as const,
  serverId: "srv_test_123",
  daemonPublicKeyB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  relay: { endpoint: "relay.supaplane.com:443", useTls: true },
  daemon: { label: "Work Mac", version: "0.0.0" },
  issuedAt: 1719446400000,
};

describe("connection-offer", () => {
  it("round-trips through a fragment URL", () => {
    const url = encodeOfferToFragmentUrl({
      offer: SAMPLE_OFFER,
      appBaseUrl: "https://app.supaplane.com",
    });
    expect(url).toMatch(/^https:\/\/app\.supaplane\.com\/#offer=/);
    const parsed = parseConnectionOfferFromUrl(url);
    expect(parsed).toEqual(SAMPLE_OFFER);
  });

  it("returns null when there is no offer fragment", () => {
    expect(parseConnectionOfferFromUrl("https://app.supaplane.com/")).toBeNull();
  });

  it("throws on a malformed payload in the fragment", () => {
    expect(() => parseConnectionOfferFromUrl("https://app.supaplane.com/#offer=not-json")).toThrow();
  });

  it("validates the v field is a literal 2", () => {
    expect(() => ConnectionOfferV2Schema.parse({ ...SAMPLE_OFFER, v: 1 })).toThrow();
  });
});
