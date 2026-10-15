import { describe, expect, it } from "vitest";
import { FetchBlockedError, SafeFetcher, isDeniedHost, isPrivateAddress } from "./fetcher";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("isDeniedHost", () => {
  it.each(["linkedin.com", "www.linkedin.com", "LinkedIn.com", "media.licdn.com", "facebook.com", "glassdoor.com"])("denies %s", (h) =>
    expect(isDeniedHost(h)).toBe(true),
  );
  it.each(["acme.com", "notlinkedin.com", "linkedin.com.evil.io"])("allows %s", (h) => expect(isDeniedHost(h)).toBe(false));
});

function fakeFetch(routes: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input.toString();
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404 });
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": "text/html", ...(r.headers ?? {}) } });
  }) as typeof fetch;
}

const publicDns = async () => ["93.184.216.34"];

describe("SafeFetcher", () => {
  it("fetches a public page and honours robots.txt allow", async () => {
    const f = new SafeFetcher({
      minDelayMs: 0,
      resolve: publicDns,
      fetchImpl: fakeFetch({
        "https://acme.com/robots.txt": { body: "User-agent: *\nDisallow: /private/" },
        "https://acme.com/": { body: "<title>Acme</title>" },
      }),
    });
    const res = await f.fetchPage("https://acme.com/");
    expect(res.status).toBe(200);
    expect(res.body).toContain("Acme");
  });

  it("blocks robots-disallowed paths", async () => {
    const f = new SafeFetcher({
      minDelayMs: 0,
      resolve: publicDns,
      fetchImpl: fakeFetch({
        "https://acme.com/robots.txt": { body: "User-agent: *\nDisallow: /private/" },
        "https://acme.com/private/x": { body: "secret" },
      }),
    });
    await expect(f.fetchPage("https://acme.com/private/x")).rejects.toMatchObject({ reason: "robots" });
  });

  it("respects a rule aimed at our user agent", async () => {
    const f = new SafeFetcher({
      minDelayMs: 0,
      resolve: publicDns,
      fetchImpl: fakeFetch({
        "https://acme.com/robots.txt": { body: "User-agent: OrigamiBot\nDisallow: /\n\nUser-agent: *\nAllow: /" },
        "https://acme.com/": { body: "x" },
      }),
    });
    await expect(f.fetchPage("https://acme.com/")).rejects.toMatchObject({ reason: "robots" });
  });

  it("treats a missing robots.txt as allow-all", async () => {
    const f = new SafeFetcher({ minDelayMs: 0, resolve: publicDns, fetchImpl: fakeFetch({ "https://acme.com/": { body: "ok" } }) });
    expect((await f.fetchPage("https://acme.com/")).body).toBe("ok");
  });

  it("blocks hosts that resolve to private space", async () => {
    const f = new SafeFetcher({ minDelayMs: 0, resolve: async () => ["10.0.0.5"], fetchImpl: fakeFetch({}) });
    await expect(f.fetchPage("https://intranet.example/")).rejects.toMatchObject({ reason: "private" });
  });

  it("blocks literal private IPs, localhost and denied hosts without touching the network", async () => {
    let calls = 0;
    const f = new SafeFetcher({ minDelayMs: 0, resolve: publicDns, fetchImpl: (async () => { calls++; return new Response(""); }) as typeof fetch });
    await expect(f.fetchPage("http://127.0.0.1:5432/")).rejects.toMatchObject({ reason: "private" });
    await expect(f.fetchPage("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ reason: "private" });
    await expect(f.fetchPage("http://localhost/")).rejects.toMatchObject({ reason: "private" });
    await expect(f.fetchPage("https://www.linkedin.com/in/someone")).rejects.toMatchObject({ reason: "denied" });
    await expect(f.fetchPage("ftp://acme.com/")).rejects.toMatchObject({ reason: "scheme" });
    expect(calls).toBe(0);
  });

  it("re-checks every redirect hop", async () => {
    const f = new SafeFetcher({
      minDelayMs: 0,
      resolve: async (host) => (host === "acme.com" ? ["93.184.216.34"] : ["192.168.0.10"]),
      fetchImpl: fakeFetch({
        "https://acme.com/": { status: 302, headers: { location: "http://internal.acme.lan/admin" } },
      }),
    });
    await expect(f.fetchPage("https://acme.com/")).rejects.toMatchObject({ reason: "private" });
  });

  it("follows a safe redirect and reports the final URL", async () => {
    const f = new SafeFetcher({
      minDelayMs: 0,
      resolve: publicDns,
      fetchImpl: fakeFetch({
        "https://acme.com/": { status: 301, headers: { location: "https://acme.com/home" } },
        "https://acme.com/home": { body: "home" },
      }),
    });
    const res = await f.fetchPage("https://acme.com/");
    expect(res.url).toBe("https://acme.com/home");
  });

  it("caps response size", async () => {
    const f = new SafeFetcher({ minDelayMs: 0, maxBytes: 10, resolve: publicDns, fetchImpl: fakeFetch({ "https://acme.com/": { body: "x".repeat(50) } }) });
    await expect(f.fetchPage("https://acme.com/")).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("surfaces HTTP errors", async () => {
    const f = new SafeFetcher({ minDelayMs: 0, resolve: publicDns, fetchImpl: fakeFetch({ "https://acme.com/": { status: 500, body: "boom" } }) });
    await expect(f.fetchPage("https://acme.com/")).rejects.toMatchObject({ reason: "http" });
  });
});
