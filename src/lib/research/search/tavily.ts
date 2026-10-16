import { SearchHttpError, type SearchOptions, type SearchProvider, type SearchResult } from "./types";

/** Tavily Search API. POST https://api.tavily.com/search, Bearer auth. 1 credit per basic request. */
export class TavilySearch implements SearchProvider {
  readonly name = "tavily" as const;
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const res = await this.fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        query,
        max_results: Math.min(opts.maxResults ?? 10, 20),
        search_depth: "basic",
        topic: "general",
        include_domains: opts.domains ?? [],
      }),
    });
    if (!res.ok) throw new SearchHttpError(res.status, await res.text().catch(() => ""), this.name);
    const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (json.results ?? [])
      .filter((r) => typeof r.url === "string")
      .map((r) => ({ title: r.title ?? "", url: r.url!, snippet: r.content ?? "" }));
  }
}
