export type SearchResult = { title: string; url: string; snippet: string };

export type SearchOptions = {
  maxResults?: number;
  /** Restrict to these domains when the provider supports it; otherwise we add site: operators. */
  domains?: string[];
};

export interface SearchProvider {
  readonly name: "tavily" | "brave" | "mock";
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

export class SearchHttpError extends Error {
  constructor(public readonly status: number, body: string, provider: string) {
    super(`${provider} search error ${status}: ${body.slice(0, 200)}`);
    this.name = "SearchHttpError";
  }
}
