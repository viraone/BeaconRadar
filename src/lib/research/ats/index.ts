import { env } from "@/lib/env";
import { USER_AGENT_NAME } from "@/lib/research/fetcher";
import { fetchAshbyBoard } from "./ashby";
import { fetchGreenhouseBoard } from "./greenhouse";
import { fetchLeverBoard } from "./lever";
import { MockAtsClient } from "./mock";
import { boardKey, type AtsClient, type BoardRef, type BoardResult } from "./types";

export type { AtsClient, AtsSource, BoardRef, BoardResult, JobPosting } from "./types";
export { ATS_SEARCH_DOMAINS, boardKey, parseAtsUrl } from "./types";

/**
 * Real client: calls the official public job-board APIs (no keys, documented for
 * this purpose) and caches each board for the lifetime of the client (one run).
 */
export class HttpAtsClient implements AtsClient {
  private cache = new Map<string, Promise<BoardResult>>();
  constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly timeoutMs = 15_000) {}

  fetchBoard(ref: BoardRef): Promise<BoardResult> {
    const key = boardKey(ref);
    let p = this.cache.get(key);
    if (!p) {
      const fetchJson = (url: string) => this.getJson(url);
      p =
        ref.source === "greenhouse" ? fetchGreenhouseBoard(ref, fetchJson)
        : ref.source === "lever" ? fetchLeverBoard(ref, fetchJson)
        : fetchAshbyBoard(ref, fetchJson);
      this.cache.set(key, p);
    }
    return p;
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": `${USER_AGENT_NAME}/0.1 (+${process.env.CRAWLER_CONTACT_URL ?? "http://localhost:3000/bot"})` },
      });
      if (res.status === 404) return null; // board doesn't exist (or isn't public): no jobs
      if (!res.ok) throw new Error(`ATS API ${res.status} for ${url}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

let cached: AtsClient | undefined;
export function getAtsClient(): AtsClient {
  if (cached) return cached;
  cached = env().SEARCH_PROVIDER === "mock" ? new MockAtsClient() : new HttpAtsClient();
  return cached;
}
