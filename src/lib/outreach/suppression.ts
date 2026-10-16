import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

export type SuppressionEntry = { email: string | null; domain: string | null };
export type SuppressibleLead = { email: string | null; companyDomain: string | null };

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^www\./, "");
}

/** Pure check used at draft and export time. Suppressed if the email matches or the lead's domain (or email domain) matches. */
export function isSuppressed(lead: SuppressibleLead, entries: SuppressionEntry[]): boolean {
  const email = lead.email ? normalizeEmail(lead.email) : null;
  const emailDomain = email?.split("@")[1] ?? null;
  const domain = lead.companyDomain ? normalizeDomain(lead.companyDomain) : null;
  for (const e of entries) {
    if (e.email && email && normalizeEmail(e.email) === email) return true;
    if (e.domain) {
      const d = normalizeDomain(e.domain);
      if (domain && (domain === d || domain.endsWith("." + d))) return true;
      if (emailDomain && (emailDomain === d || emailDomain.endsWith("." + d))) return true;
    }
  }
  return false;
}

export async function loadSuppression(workspaceId: string): Promise<SuppressionEntry[]> {
  return db
    .select({ email: schema.suppressionList.email, domain: schema.suppressionList.domain })
    .from(schema.suppressionList)
    .where(eq(schema.suppressionList.workspaceId, workspaceId));
}
