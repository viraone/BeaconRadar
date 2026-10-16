import { CREDIT_COSTS } from "@/config/credits";
import type { EnrichResult } from "./types";

export type PlannedCharge = { action: "enrich_found" | "verify"; amount: number; idempotencyKey: string; reason: string };

/** Credits owed for an enrichment outcome: found (any email) + verify (only if verified). Nothing for not_found. */
export function planEnrichmentCharges(leadId: string, company: string, result: EnrichResult): PlannedCharge[] {
  if (!result.email) return [];
  const charges: PlannedCharge[] = [{ action: "enrich_found", amount: CREDIT_COSTS.enrich_found, idempotencyKey: `lead:${leadId}:enrich_found`, reason: `Email found: ${company}` }];
  if (result.status === "verified") charges.push({ action: "verify", amount: CREDIT_COSTS.verify, idempotencyKey: `lead:${leadId}:verify`, reason: `Email verified: ${company}` });
  return charges;
}

/** Upper bound shown before the user approves enrichment. */
export function estimateEnrichmentCredits(leadCount: number): number {
  return leadCount * (CREDIT_COSTS.enrich_found + CREDIT_COSTS.verify);
}
