import { z } from "zod";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export type NormalizedSite = { siteUrl: string; domain: string };

/**
 * Turns user input like "Acme.com", "https://www.acme.com/pricing" into a canonical
 * https origin and a bare domain. Rejects IPs, localhost and non-http schemes.
 * DNS/IP-level SSRF checks happen in the fetcher (Phase 2), not here.
 */
export function normalizeSiteUrl(input: string): NormalizedSite {
  let raw = input.trim();
  if (!raw) throw new Error("Enter your company website.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https websites are supported.");
  }
  if (url.username || url.password) throw new Error("Remove the username/password from the address.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) throw new Error("Enter a public website, not a local address.");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new Error("Enter a domain name, not an IP address.");
  }
  if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host) || host.length > 253) {
    throw new Error("Enter a full domain like acme.com.");
  }
  const labels = host.split(".");
  if (labels.some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) {
    throw new Error("Enter a full domain like acme.com.");
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld) && !tld.startsWith("xn--")) {
    throw new Error("Enter a full domain like acme.com.");
  }

  const domain = host.startsWith("www.") ? host.slice(4) : host;
  return { siteUrl: `https://${host}`, domain };
}

export const siteUrlSchema = z.string().transform((v, ctx) => {
  try {
    return normalizeSiteUrl(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});
