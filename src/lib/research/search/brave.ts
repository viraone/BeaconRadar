import { SearchHttpError, type SearchOptions, type SearchProvider, type SearchResult } from "./types";

/** Brave Search API. GET https://api.search.brave.com/res/v1/web/search with X-Subscription-Token. */
export class BraveSearch implements SearchProvider {
  readonly name = "brave" as const;
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    // Brave has no include_domains parameter; fold them into the query as site: operators.
    const q = opts.domains?.length ? `${query} (${opts.domains.map((d) => `site:${d}`).join(" OR ")})` : query;
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", q);
    url.searchParams.set("count", String(Math.min(opts.maxResults ?? 10, 20)));
    const res = await this.fetchImpl(url, { headers: { accept: "application/json", "x-subscription-token": this.apiKey } });
    if (!res.ok) throw new SearchHttpError(res.status, await res.text().catch(() => ""), this.name);
    const json = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    return (json.web?.results ?? [])
      .filter((r) => typeof r.url === "string")
      .map((r) => ({ title: r.title ?? "", url: r.url!, snippet: r.description ?? "" }));
  }
}
