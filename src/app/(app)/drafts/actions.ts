"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/workspace";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { senderIsComplete } from "@/lib/outreach/footer";
import { startDrafting } from "@/lib/outreach/start";
import type { Channel } from "@/lib/outreach/validators";

export type DraftActionResult = { error?: string; ok?: boolean; message?: string } | undefined;

export async function draftForLeadsAction(playId: string, leadIds: string[], channel: Channel = "email"): Promise<DraftActionResult> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  if (!senderIsComplete(ctx.workspace)) return { error: "Set your sender name, company and postal address in Settings first. The opt-out footer needs them." };
  if (leadIds.length === 0) return { error: "Select at least one lead." };
  const rows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.workspaceId, ctx.workspace.id), eq(schema.leads.playId, playId), inArray(schema.leads.id, leadIds)));
  if (rows.length === 0) return { error: "No leads selected." };
  const balance = await getBalance(ctx.workspace.id);
  if (balance < 1) return { error: "Not enough credits (1 per draft)." };
  await startDrafting(ctx.workspace.id, rows.map((r) => r.id), channel);
  revalidatePath("/drafts");
  return { ok: true, message: `Drafting ${rows.length} message${rows.length === 1 ? "" : "s"}… see the Drafts page.` };
}

export async function setDraftStatus(draftId: string, status: "approved" | "discarded" | "sent_manually"): Promise<DraftActionResult> {
  const ctx = await requireWorkspace("/drafts");
  const [d] = await db.select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, draftId), eq(schema.outreachDrafts.workspaceId, ctx.workspace.id))).limit(1);
  if (!d) return { error: "Draft not found." };
  if (status === "approved" && d.status === "blocked") return { error: "Fix the blocked draft first (edit or regenerate)." };
  await db.update(schema.outreachDrafts).set({ status, updatedAt: new Date() }).where(eq(schema.outreachDrafts.id, draftId));
  revalidatePath("/drafts");
  return { ok: true };
}

export async function regenerateDraft(draftId: string): Promise<DraftActionResult> {
  const ctx = await requireWorkspace("/drafts");
  const [d] = await db.select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, draftId), eq(schema.outreachDrafts.workspaceId, ctx.workspace.id))).limit(1);
  if (!d) return { error: "Draft not found." };
  const balance = await getBalance(ctx.workspace.id);
  if (balance < 1) return { error: "Not enough credits (1 per draft)." };
  await db.update(schema.outreachDrafts).set({ status: "discarded", updatedAt: new Date() }).where(eq(schema.outreachDrafts.id, draftId));
  await startDrafting(ctx.workspace.id, [d.leadId], d.channel);
  revalidatePath("/drafts");
  return { ok: true, message: "Regenerating…" };
}

/** Manual edit of the message text. Re-runs the checks server-side. */
export async function editDraft(draftId: string, subject: string, body: string): Promise<DraftActionResult> {
  const ctx = await requireWorkspace("/drafts");
  const [d] = await db.select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, draftId), eq(schema.outreachDrafts.workspaceId, ctx.workspace.id))).limit(1);
  if (!d) return { error: "Draft not found." };
  const { validateDraft } = await import("@/lib/outreach/validators");
  const { appendFooter } = await import("@/lib/outreach/footer");
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, d.leadId)).limit(1);
  const previous = await db
    .select({ body: schema.outreachDrafts.body })
    .from(schema.outreachDrafts)
    .where(and(eq(schema.outreachDrafts.leadId, d.leadId), inArray(schema.outreachDrafts.status, ["approved", "sent_manually"])));
  const stepNumber = previous.length + 1;
  const reasons = validateDraft(
    { channel: d.channel, subject: d.channel === "email" ? subject.trim() : null, body, beliefStage: d.beliefStage, newValue: d.newValue },
    { leadStage: lead?.beliefStage ?? "problem_awareness", stepNumber, previousBodies: previous.map((p) => p.body) },
  );
  const full = d.channel === "email" ? appendFooter(body, ctx.workspace) : body.trim();
  await db
    .update(schema.outreachDrafts)
    .set({ subject: d.channel === "email" ? subject.trim().slice(0, 120) : null, body: full, blockReasons: reasons, status: reasons.length ? "blocked" : "draft", updatedAt: new Date() })
    .where(eq(schema.outreachDrafts.id, draftId));
  revalidatePath("/drafts");
  return reasons.length ? { error: `Still blocked: ${reasons.join(" ")}` } : { ok: true, message: "Saved. Checks pass." };
}
