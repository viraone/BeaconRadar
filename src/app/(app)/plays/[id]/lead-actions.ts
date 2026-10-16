"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/workspace";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { startEnrichment } from "@/lib/enrichment/start";
import { normalizeDomain } from "@/lib/outreach/suppression";

export type LeadActionResult = { error?: string; ok?: boolean; message?: string } | undefined;

/** Removes a lead. Credits already spent on it are not refunded (it was found). */
export async function deleteLead(leadId: string, playId: string): Promise<LeadActionResult> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  await db.delete(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.workspaceId, ctx.workspace.id)));
  revalidatePath(`/plays/${playId}`);
  return { ok: true };
}

const contactSchema = z.object({
  person: z.string().trim().max(120),
  title: z.string().trim().max(120),
  companyDomain: z.string().trim().max(253),
});

/** The user supplies a contact they know. Clears any previous email result since the person changed. */
export async function updateLeadContact(leadId: string, playId: string, formData: FormData): Promise<LeadActionResult> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  let domain: string | null = null;
  if (d.companyDomain) {
    domain = normalizeDomain(d.companyDomain.replace(/^https?:\/\//, "").split("/")[0]);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter a domain like acme.com." };
  }
  await db
    .update(schema.leads)
    .set({ person: d.person || null, title: d.title || null, companyDomain: domain, email: null, emailStatus: "unknown", emailProvider: null, updatedAt: new Date() })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.workspaceId, ctx.workspace.id)));
  revalidatePath(`/plays/${playId}`);
  return { ok: true };
}

/** Enrich chosen leads (or every lead without a result when ids is empty). */
export async function enrichLeadsAction(playId: string, leadIds: string[]): Promise<LeadActionResult> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  const where = leadIds.length
    ? and(eq(schema.leads.workspaceId, ctx.workspace.id), eq(schema.leads.playId, playId), inArray(schema.leads.id, leadIds))
    : and(eq(schema.leads.workspaceId, ctx.workspace.id), eq(schema.leads.playId, playId), isNull(schema.leads.email));
  const rows = await db.select({ id: schema.leads.id, person: schema.leads.person }).from(schema.leads).where(where);
  const withPerson = rows.filter((r) => r.person);
  if (rows.length === 0) return { error: "No leads selected." };
  if (withPerson.length === 0) return { error: "None of these leads has a contact name yet. Add a contact first; nothing is guessed." };
  const balance = await getBalance(ctx.workspace.id);
  if (balance < 2) return { error: "Not enough credits to find an email (2 per email found, +1 if verified)." };
  await startEnrichment(ctx.workspace.id, withPerson.map((r) => r.id));
  revalidatePath(`/plays/${playId}`);
  const skipped = rows.length - withPerson.length;
  return { ok: true, message: `Enriching ${withPerson.length} lead${withPerson.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped: no contact name)` : ""}…` };
}
