import { env } from "@/lib/env";
import { BraveSearch } from "./brave";
import { MockSearch } from "./mock";
import { TavilySearch } from "./tavily";
import type { SearchProvider } from "./types";

let cached: SearchProvider | undefined;

export function getSearch(): SearchProvider {
  if (cached) return cached;
  const e = env();
  if (e.SEARCH_PROVIDER === "tavily") {
    if (!e.TAVILY_API_KEY) throw new Error("SEARCH_PROVIDER=tavily but TAVILY_API_KEY is empty.");
    cached = new TavilySearch(e.TAVILY_API_KEY);
  } else if (e.SEARCH_PROVIDER === "brave") {
    if (!e.BRAVE_SEARCH_API_KEY) throw new Error("SEARCH_PROVIDER=brave but BRAVE_SEARCH_API_KEY is empty.");
    cached = new BraveSearch(e.BRAVE_SEARCH_API_KEY);
  } else {
    cached = new MockSearch();
  }
  return cached;
}

export type { SearchProvider, SearchResult, SearchOptions } from "./types";
