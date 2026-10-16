import { NOT_FOUND, type EmailProvider, type EnrichInput, type EnrichResult } from "./types";

export type WaterfallAttempt = { provider: string; status: EnrichResult["status"] | "error"; error?: string };
export type WaterfallOutcome = { result: EnrichResult; provider: string | null; attempts: WaterfallAttempt[] };

/**
 * Try providers in order. Stop at the first VERIFIED email. If nobody verifies,
 * fall back to the first UNVERIFIED hit. Provider errors are recorded and skipped.
 * Nothing is attempted without a person name (we don't guess role addresses).
 */
export async function enrichWithWaterfall(input: EnrichInput, providers: EmailProvider[]): Promise<WaterfallOutcome> {
  const attempts: WaterfallAttempt[] = [];
  if (!input.person?.trim()) return { result: NOT_FOUND, provider: null, attempts: [{ provider: "precheck", status: "not_found", error: "no person name" }] };

  let fallback: { result: EnrichResult; provider: string } | null = null;
  for (const p of providers) {
    let r: EnrichResult;
    try {
      r = await p.findEmail(input);
    } catch (e) {
      attempts.push({ provider: p.name, status: "error", error: (e as Error).message });
      continue;
    }
    attempts.push({ provider: p.name, status: r.status });
    if (r.status === "verified" && r.email) return { result: r, provider: p.name, attempts };
    if (r.status === "unverified" && r.email && !fallback) fallback = { result: r, provider: p.name };
  }
  if (fallback) return { result: fallback.result, provider: fallback.provider, attempts };
  return { result: NOT_FOUND, provider: null, attempts };
}
