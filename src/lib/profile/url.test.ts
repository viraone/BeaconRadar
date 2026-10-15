import { describe, expect, it } from "vitest";
import { normalizeSiteUrl } from "./url";

describe("normalizeSiteUrl", () => {
  it("adds https and strips paths", () => {
    expect(normalizeSiteUrl("acme.com/pricing?x=1")).toEqual({ siteUrl: "https://acme.com", domain: "acme.com" });
  });
  it("lowercases and keeps www in the URL but not the domain", () => {
    expect(normalizeSiteUrl("  HTTP://WWW.Acme.COM ")).toEqual({ siteUrl: "https://www.acme.com", domain: "acme.com" });
  });
  it("keeps subdomains", () => {
    expect(normalizeSiteUrl("app.acme.co.uk").domain).toBe("app.acme.co.uk");
  });
  it.each(["", "   ", "acme", "localhost", "127.0.0.1", "http://10.0.0.1", "ftp://acme.com", "https://user:pw@acme.com", "acme.123", "-acme.com", "[::1]"])(
    "rejects %j",
    (bad) => {
      expect(() => normalizeSiteUrl(bad)).toThrow();
    },
  );
});
