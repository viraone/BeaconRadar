import { and, eq, inArray, sql } from "drizzle-orm";
import { chargeOnce } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { planEnrichmentCharges } from "./charges";
import { getEnrichmentProviders } from "./index";
import type { EmailProvider } from "./types";
import { enrichWithWaterfall } from "./waterfall";

export type EnrichSummary = { processed: number; found: number; verified: number; notFound: number; skippedNoCredits: number; skippedNoPerson: number };

/**
 * Enrich a set of leads. Per lead: run the waterfall, then in one transaction
 * write the email and charge for what was found. If credits can't cover the
 * charge the lead is left untouched (status stays unknown) and we stop.
 */
export async function enrichLeads(workspaceId: string, leadIds: string[], providers: EmailProvider[] = getEnrichmentProviders()): Promise<EnrichSummary> {
  const summary: EnrichSummary = { processed: 0, found: 0, verified: 0, notFound: 0, skippedNoCredits: 0, skippedNoPerson: 0 };
  if (leadIds.length === 0) return summary;
  const leads = await db.select().from(schema.leads).where(and(eq(schema.leads.workspaceId, workspaceId), inArray(schema.leads.id, leadIds)));

  for (const lead of leads) {
    if (!lead.person) {
      summary.skippedNoPerson++;
      await db.update(schema.leads).set({ emailStatus: "not_found", email: null, emailProvider: null, updatedAt: new Date() }).where(eq(schema.leads.id, lead.id));
      continue;
    }
    const outcome = await enrichWithWaterfall({ company: lead.company, companyDomain: lead.companyDomain, person: lead.person, title: lead.title }, providers);
    summary.processed++;
    const charges = planEnrichmentCharges(lead.id, lead.company, outcome.result);
    const isMock = providers.find((p) => p.name === outcome.provider)?.isMock ?? false;

    const ok = await db.transaction(async (tx) => {
      for (const c of charges) {
        const r = await chargeOnce({ workspaceId, amount: c.amount, action: c.action, reason: c.reason, refType: "lead", refId: lead.id, idempotencyKey: c.idempotencyKey }, tx);
        if (!r.ok) {
          tx.rollback();
          return false;
        }
      }
      const signal = { ...(lead.signal ?? {}), email: { provider: outcome.provider, mock: isMock, confidence: outcome.result.confidence, sourceUrl: outcome.result.sourceUrl, attempts: outcome.attempts, checkedAt: new Date().toISOString() } };
      await tx
        .update(schema.leads)
        .set({
          email: outcome.result.email,
          emailStatus: outcome.result.status,
          emailProvider: outcome.provider,
          sourceUrls: outcome.result.sourceUrl ? sql`array_append(${schema.leads.sourceUrls}, ${outcome.result.sourceUrl})` : undefined,
          signal,
          updatedAt: new Date(),
        })
        .where(eq(schema.leads.id, lead.id));
      return true;
    }).catch((e) => {
      if (String((e as Error).message).includes("Rollback")) return false;
      throw e;
    });

    if (!ok) {
      summary.skippedNoCredits++;
      break;
    }
    if (outcome.result.status === "verified") summary.verified++;
    if (outcome.result.email) summary.found++;
    else summary.notFound++;
  }
  return summary;
}
