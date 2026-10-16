import { PLANS, type Plan } from "@/config/credits";
import { toCsv } from "@/lib/csv";
import type { schema } from "@/lib/db/client";
import { isSuppressed, type SuppressionEntry } from "@/lib/outreach/suppression";

export type LeadRow = typeof schema.leads.$inferSelect;

export function canExport(plan: Plan): boolean {
  return PLANS[plan].canExport;
}

export const LEAD_CSV_COLUMNS = ["company", "company_domain", "person", "title", "email", "email_status", "fit_reason", "signal_title", "signal_location", "signal_posted_at", "source_urls", "found_at"] as const;

/** Suppressed leads are left out of exports entirely; the count is reported so the UI can say so. */
export function buildLeadsCsv(leads: LeadRow[], suppression: SuppressionEntry[]): { csv: string; exported: number; suppressed: number } {
  const kept = leads.filter((l) => !isSuppressed({ email: l.email, companyDomain: l.companyDomain }, suppression));
  const rows: unknown[][] = [[...LEAD_CSV_COLUMNS]];
  for (const l of kept) {
    const sig = (l.signal ?? {}) as Record<string, unknown>;
    rows.push([
      l.company,
      l.companyDomain ?? "",
      l.person ?? "not found",
      l.title ?? "not found",
      l.email ?? "not found",
      l.emailStatus,
      l.fitReason ?? "",
      typeof sig.title === "string" ? sig.title : "",
      typeof sig.location === "string" ? sig.location : "",
      typeof sig.postedAt === "string" ? sig.postedAt.slice(0, 10) : "",
      l.sourceUrls.join(" "),
      l.createdAt.toISOString(),
    ]);
  }
  return { csv: toCsv(rows), exported: kept.length, suppressed: leads.length - kept.length };
}
