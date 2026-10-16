import type { SearchOptions, SearchProvider, SearchResult } from "./types";
import { MOCK_BOARDS } from "../ats/mock";

/**
 * Offline search: returns job-board URLs from the mock ATS fixtures whose titles
 * loosely match the query. Lets the hiring play run end to end with no keys.
 */
export class MockSearch implements SearchProvider {
  readonly name = "mock" as const;
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const terms = query.toLowerCase().replace(/site:\S+/g, "").replace(/["()]/g, "").split(/\s+/).filter((t) => t.length > 2 && t !== "or");
    const out: SearchResult[] = [];
    for (const board of MOCK_BOARDS) {
      if (opts.domains?.length && !opts.domains.some((d) => board.host.endsWith(d))) continue;
      for (const job of board.jobs) {
        const hay = `${job.title} ${board.companyName}`.toLowerCase();
        if (terms.some((t) => hay.includes(t))) {
          out.push({ title: `${job.title} - ${board.companyName}`, url: job.url, snippet: `${board.companyName} is hiring a ${job.title} in ${job.location}.` });
        }
      }
    }
    return out.slice(0, opts.maxResults ?? 10);
  }
}
