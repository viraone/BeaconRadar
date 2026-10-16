import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import robotsParser from "robots-parser";

/**
 * The only way the app fetches third-party web pages.
 *
 * Guarantees:
 *  - http/https only, public hosts only (SSRF guard: every hop's hostname is
 *    resolved and rejected if it points at private/loopback/link-local/metadata space)
 *  - robots.txt is honoured for our user agent (fail-open only if robots.txt itself 404s)
 *  - a denylist for sites whose terms prohibit automated access
 *  - per-host politeness delay, size and time caps, no cookies, no JS
 */

export const USER_AGENT_NAME = "BeaconRadarBot";

export const DENIED_HOST_SUFFIXES = [
  "linkedin.com", "licdn.com",
  "facebook.com", "instagram.com", "threads.net",
  "x.com", "twitter.com",
  "glassdoor.com", "indeed.com",
  "crunchbase.com", "zoominfo.com", "apollo.io", "rocketreach.co",
];

export type FetchResult = {
  url: string;          // final URL after redirects
  status: number;
  contentType: string;
  body: string;
};

export class FetchBlockedError extends Error {
  constructor(message: string, public readonly reason: "scheme" | "private" | "denied" | "robots" | "redirects" | "size" | "timeout" | "http") {
    super(message);
    this.name = "FetchBlockedError";
  }
}

export type FetcherOptions = {
  userAgent?: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  minDelayMs?: number;
  /** Test seam: replaces global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: replaces DNS. */
  resolve?: (host: string) => Promise<string[]>;
  /** Skip robots for tests. Never set in app code. */
  ignoreRobots?: boolean;
};

// ---------------------------------------------------------------- IP checks

/** True for addresses we must never connect to. Pure function, unit-tested. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) return isPrivateV6(ip);
  return true; // not an IP at all: treat as unsafe
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;               // this-net, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true;               // carrier NAT
  if (a === 169 && b === 254) return true;                         // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;                // private
  if (a === 192 && b === 168) return true;                         // private
  if (a === 192 && b === 0 && p[2] === 0) return true;             // IETF
  if (a === 198 && (b === 18 || b === 19)) return true;            // benchmarking
  if (a >= 224) return true;                                       // multicast, reserved, broadcast
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("ff")) return true;                            // multicast
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);        // IPv4-mapped
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower.startsWith("2001:db8:")) return true;                      // documentation
  if (lower.startsWith("64:ff9b:")) return true;                       // NAT64
  return false;
}

export function isDeniedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return DENIED_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}

// ---------------------------------------------------------------- the fetcher

export class SafeFetcher {
  private robotsCache = new Map<string, ReturnType<typeof robotsParser> | null>();
  private lastHit = new Map<string, number>();
  private readonly ua: string;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly minDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly resolve: (host: string) => Promise<string[]>;
  private readonly ignoreRobots: boolean;

  constructor(opts: FetcherOptions = {}) {
    this.ua = opts.userAgent ?? `${USER_AGENT_NAME}/0.1 (+${process.env.CRAWLER_CONTACT_URL ?? "http://localhost:3000/bot"})`;
    this.maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRedirects = opts.maxRedirects ?? 5;
    this.minDelayMs = opts.minDelayMs ?? 1000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.resolve = opts.resolve ?? (async (host) => (await lookup(host, { all: true })).map((a) => a.address));
    this.ignoreRobots = opts.ignoreRobots ?? false;
  }

  /** Throws FetchBlockedError if the URL may not be fetched. */
  async assertAllowed(rawUrl: string): Promise<URL> {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError(`Unsupported scheme ${url.protocol}`, "scheme");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isDeniedHost(host)) throw new FetchBlockedError(`${host} prohibits automated access`, "denied");
    if (isIP(host)) {
      if (isPrivateAddress(host)) throw new FetchBlockedError(`${host} is not a public address`, "private");
      return url;
    }
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new FetchBlockedError(`${host} is not a public host`, "private");
    }
    let addrs: string[];
    try {
      addrs = await this.resolve(host);
    } catch {
      throw new FetchBlockedError(`Could not resolve ${host}`, "private");
    }
    if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new FetchBlockedError(`${host} resolves to a non-public address`, "private");
    return url;
  }

  async isAllowedByRobots(url: URL): Promise<boolean> {
    if (this.ignoreRobots) return true;
    const key = url.origin;
    if (!this.robotsCache.has(key)) {
      let parsed: ReturnType<typeof robotsParser> | null = null;
      try {
        const res = await this.rawGet(new URL("/robots.txt", url.origin), 256 * 1024);
        if (res.status >= 200 && res.status < 300) parsed = robotsParser(`${key}/robots.txt`, res.body);
        else if (res.status >= 500) parsed = robotsParser(`${key}/robots.txt`, "User-agent: *\nDisallow: /"); // fail closed on server errors
      } catch {
        parsed = robotsParser(`${key}/robots.txt`, "User-agent: *\nDisallow: /"); // unreachable: fail closed
      }
      this.robotsCache.set(key, parsed);
    }
    const robots = this.robotsCache.get(key);
    if (!robots) return true; // no robots.txt (404): everything allowed
    return robots.isAllowed(url.toString(), USER_AGENT_NAME) !== false;
  }

  /** Fetch an HTML/text page with every guard applied. */
  async fetchPage(rawUrl: string): Promise<FetchResult> {
    let url = await this.assertAllowed(rawUrl);
    if (!(await this.isAllowedByRobots(url))) throw new FetchBlockedError(`robots.txt disallows ${url}`, "robots");

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      await this.politeDelay(url.hostname);
      const res = await this.rawGet(url, this.maxBytes);
      if (res.status >= 300 && res.status < 400 && res.location) {
        const nextUrl = await this.assertAllowed(new URL(res.location, url).toString());
        if (!(await this.isAllowedByRobots(nextUrl))) throw new FetchBlockedError(`robots.txt disallows ${nextUrl}`, "robots");
        url = nextUrl;
        continue;
      }
      if (res.status >= 400) throw new FetchBlockedError(`HTTP ${res.status} for ${url}`, "http");
      return { url: url.toString(), status: res.status, contentType: res.contentType, body: res.body };
    }
    throw new FetchBlockedError(`Too many redirects from ${rawUrl}`, "redirects");
  }

  private async politeDelay(host: string) {
    const last = this.lastHit.get(host) ?? 0;
    const wait = last + this.minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastHit.set(host, Date.now());
  }

  private async rawGet(url: URL, maxBytes: number): Promise<{ status: number; contentType: string; body: string; location: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": this.ua, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5", "accept-language": "en" },
      });
      const contentType = res.headers.get("content-type") ?? "";
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400) return { status: res.status, contentType, body: "", location };
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > maxBytes) throw new FetchBlockedError(`Response larger than ${maxBytes} bytes`, "size");
      const body = await readCapped(res, maxBytes);
      return { status: res.status, contentType, body, location: null };
    } catch (e) {
      if (e instanceof FetchBlockedError) throw e;
      if ((e as Error).name === "AbortError") throw new FetchBlockedError(`Timed out fetching ${url}`, "timeout");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchBlockedError(`Response larger than ${maxBytes} bytes`, "size");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

let shared: SafeFetcher | undefined;
export function getFetcher(): SafeFetcher {
  return (shared ??= new SafeFetcher());
}
