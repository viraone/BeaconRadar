import { env } from "@/lib/env";
import { mockA, mockB } from "./providers/mock";
import type { EmailProvider } from "./types";

export type { EmailProvider, EnrichInput, EnrichResult, EmailStatus } from "./types";
export { enrichWithWaterfall } from "./waterfall";

const REGISTRY: Record<string, EmailProvider> = { mockA, mockB };

/** Providers in waterfall order, from ENRICHMENT_PROVIDERS (comma-separated names). */
export function getEnrichmentProviders(): EmailProvider[] {
  const names = env().ENRICHMENT_PROVIDERS.split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("ENRICHMENT_PROVIDERS is empty.");
  return names.map((n) => {
    const p = REGISTRY[n];
    if (!p) throw new Error(`Unknown enrichment provider "${n}". Known: ${Object.keys(REGISTRY).join(", ")}`);
    return p;
  });
}
