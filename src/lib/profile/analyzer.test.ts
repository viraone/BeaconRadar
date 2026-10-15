import { describe, expect, it } from "vitest";
import { mockLlm, type LlmProvider } from "@/lib/llm/llm";
import { SafeFetcher } from "@/lib/research/fetcher";
import { analyzeSite, groundedName } from "./analyzer";
import { extractPage } from "@/lib/research/extract";

const home = `<html><head><title>Acme Robotics | Warehouse automation</title><meta name="description" content="Acme builds picking robots for mid-size 3PLs."></head>
<body><main><h1>Robots that pick orders</h1><a href="/about">About</a><a href="/pricing">Pricing</a><a href="/blog/x">Blog</a><a href="/private/secret">S</a>
<h2>Cut picking labor by half</h2><p>Trusted by regional 3PLs.</p></main></body></html>`;
const about = `<html><head><title>About | Acme Robotics</title></head><body><main><h1>About Acme Robotics</h1><p>Founded 2019. We sell to operations leaders at 3PLs with 50 to 500 staff.</p></main></body></html>`;

function fetcherFor(routes: Record<string, string | { status: number }>) {
  return new SafeFetcher({
    minDelayMs: 0,
    resolve: async () => ["93.184.216.34"],
    fetchImpl: (async (input: RequestInfo | URL) => {
      const r = routes[input.toString()];
      if (r === undefined) return new Response("nf", { status: 404 });
      if (typeof r !== "string") return new Response("", { status: r.status });
      return new Response(r, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
  });
}

describe("analyzeSite", () => {
  it("crawls home + informative pages, respects robots, and returns a grounded profile (mock LLM)", async () => {
    const fetcher = fetcherFor({
      "https://acme.com/robots.txt": "User-agent: *\nDisallow: /private/",
      "https://acme.com/": home,
      "https://acme.com/about": about,
      "https://acme.com/pricing": { status: 500 },
    });
    const result = await analyzeSite("https://acme.com", { fetcher, llm: mockLlm });
    expect(result.provider).toBe("mock");
    expect(result.companyName).toBe("Acme Robotics");
    expect(result.sourceUrls).toEqual(["https://acme.com/", "https://acme.com/about"]);
    expect(result.skipped).toEqual([{ url: "https://acme.com/pricing", reason: "http" }]);
    expect(result.summary).toContain("picking robots");
    expect(result.icp.painPoints.length).toBeGreaterThan(0);
    // blog and robots-blocked pages were never candidates
    expect(result.sourceUrls.some((u) => /blog|private/.test(u))).toBe(false);
  });

  it("drops a company name the model invented", async () => {
    const liar: LlmProvider = {
      name: "mock",
      async generateJson(req) {
        const data = req.schema.parse({
          companyName: "Globex Corporation",
          summary: "s",
          offering: "o",
          icp: { industries: ["Logistics"], companySizes: ["50-500"], geographies: [], buyerTitles: ["VP Operations"], painPoints: [], buyingSignals: [], disqualifiers: [] },
        });
        return { data, model: "test", provider: "mock", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };
    const result = await analyzeSite("https://acme.com", { fetcher: fetcherFor({ "https://acme.com/": home }), llm: liar });
    expect(result.companyName).toBeNull();
    expect(result.icp.companySizes).toEqual(["11-50", "51-200", "201-1000"]);
    expect(result.icp.buyerTitles).toEqual(["VP Operations"]);
  });

  it("fails when the home page cannot be read", async () => {
    await expect(analyzeSite("https://acme.com", { fetcher: fetcherFor({}), llm: mockLlm })).rejects.toMatchObject({ reason: "http" });
  });
});

describe("groundedName", () => {
  const pages = [extractPage(home, "https://acme.com/")];
  it("accepts names present on the page regardless of case/punctuation", () => {
    expect(groundedName("acme robotics", pages)).toBe("acme robotics");
    expect(groundedName("Acme-Robotics", pages)).toBe("Acme-Robotics");
  });
  it("rejects names not on the page", () => {
    expect(groundedName("Initech", pages)).toBeNull();
    expect(groundedName(null, pages)).toBeNull();
  });
});

describe("mockProfile company name", () => {
  it.each([
    ["Acme Robotics | Warehouse automation", "Acme Robotics"],
    ["Home \\ Anthropic", "Anthropic"],
    ["Acme - Robots", "Acme"],
    ["Welcome", null],
  ])("%s -> %s", async (title, expected) => {
    const { mockProfile } = await import("./analyzer");
    const page = extractPage(`<html><head><title>${title}</title></head><body><main><p>x</p></main></body></html>`, "https://a.com/");
    expect(mockProfile([page]).companyName).toBe(expected);
  });
});
