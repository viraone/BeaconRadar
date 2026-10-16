import { and, eq, inArray, desc } from "drizzle-orm";
import { CREDIT_COSTS } from "@/config/credits";
import { chargeOnce } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { generateDraft } from "./draft";
import { senderIsComplete } from "./footer";
import { isSuppressed, loadSuppression } from "./suppression";
import type { Channel } from "./validators";

export type DraftSummary = { drafted: number; blocked: number; suppressed: number; skippedNoCredits: number; failed: number };

/**
 * Draft a cold first touch for each lead. Each draft costs 1 credit (charged
 * even if the checks block it: the model ran). Suppressed leads are skipped.
 */
export async function draftForLeads(workspaceId: string, leadIds: string[], channel: Channel = "email", taskId: string | null = null): Promise<DraftSummary> {
  const summary: DraftSummary = { drafted: 0, blocked: 0, suppressed: 0, skippedNoCredits: 0, failed: 0 };
  if (leadIds.length === 0) return summary;
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  if (!workspace) return summary;
  if (!senderIsComplete(workspace)) throw new Error("Set your sender name, company and postal address in Settings before drafting.");

  const [leads, suppression] = await Promise.all([
    db.select().from(schema.leads).where(and(eq(schema.leads.workspaceId, workspaceId), inArray(schema.leads.id, leadIds))),
    loadSuppression(workspaceId),
  ]);
  const profileIds = Array.from(new Set(leads.map((l) => l.playId)));
  const plays = profileIds.length ? await db.select().from(schema.plays).where(inArray(schema.plays.id, profileIds)) : [];
  const profiles = plays.length ? await db.select().from(schema.companyProfiles).where(inArray(schema.companyProfiles.id, Array.from(new Set(plays.map((p) => p.companyProfileId))))) : [];
  const profileByPlay = new Map(plays.map((p) => [p.id, profiles.find((pr) => pr.id === p.companyProfileId)]));

  for (const lead of leads) {
    if (isSuppressed({ email: lead.email, companyDomain: lead.companyDomain }, suppression)) {
      summary.suppressed++;
      continue;
    }
    const profile = profileByPlay.get(lead.playId);
    if (!profile) {
      summary.failed++;
      continue;
    }
    const previous = await db
      .select({ body: schema.outreachDrafts.body })
      .from(schema.outreachDrafts)
      .where(and(eq(schema.outreachDrafts.leadId, lead.id), inArray(schema.outreachDrafts.status, ["approved", "sent_manually"])))
      .orderBy(desc(schema.outreachDrafts.createdAt));
    const stepNumber = previous.length + 1;

    let generated;
    try {
      generated = await generateDraft({
        lead,
        profile,
        sender: workspace,
        channel,
        stepNumber,
        intent: stepNumber === 1 ? "first touch" : "follow-up",
        previousBodies: previous.map((p) => p.body),
      });
    } catch (e) {
      summary.failed++;
      console.error(`[draft] lead ${lead.id}: ${(e as Error).message}`);
      continue;
    }

    const ok = await db
      .transaction(async (tx) => {
        const [draft] = await tx
          .insert(schema.outreachDrafts)
          .values({
            leadId: lead.id,
            workspaceId,
            taskId,
            channel,
            subject: generated.subject,
            body: generated.body,
            beliefStage: generated.beliefStage,
            newValue: generated.newValue,
            status: generated.blockReasons.length ? "blocked" : "draft",
            blockReasons: generated.blockReasons,
            model: generated.model,
          })
          .returning({ id: schema.outreachDrafts.id });
        const charge = await chargeOnce(
          { workspaceId, amount: CREDIT_COSTS.draft, action: "draft", reason: `Draft written: ${lead.company}`, refType: "draft", refId: draft.id, idempotencyKey: `draft:${draft.id}:draft` },
          tx,
        );
        if (!charge.ok) {
          tx.rollback();
          return false;
        }
        return true;
      })
      .catch((e) => {
        if (String((e as Error).message).includes("Rollback")) return false;
        throw e;
      });

    if (!ok) {
      summary.skippedNoCredits++;
      break;
    }
    if (generated.blockReasons.length) summary.blocked++;
    else summary.drafted++;
  }
  return summary;
}
