import { and, asc, eq, inArray, desc, lt } from "drizzle-orm";
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

/**
 * Draft the message for a sequence task: channel and step come from the step,
 * earlier steps' sent drafts are passed as context. 1 credit. Idempotent: an
 * existing non-discarded draft for the task is kept.
 */
export async function draftForTask(taskId: string): Promise<{ status: "drafted" | "blocked" | "exists" | "skipped"; reason?: string }> {
  const [row] = await db
    .select({ task: schema.tasks, step: schema.sequenceSteps, lead: schema.leads, enrollment: schema.sequenceEnrollments })
    .from(schema.tasks)
    .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.tasks.stepId))
    .innerJoin(schema.leads, eq(schema.leads.id, schema.tasks.leadId))
    .innerJoin(schema.sequenceEnrollments, eq(schema.sequenceEnrollments.id, schema.tasks.enrollmentId))
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!row) return { status: "skipped", reason: "task not found" };
  if (row.task.status !== "pending") return { status: "skipped", reason: `task is ${row.task.status}` };
  const existing = await db
    .select({ id: schema.outreachDrafts.id })
    .from(schema.outreachDrafts)
    .where(and(eq(schema.outreachDrafts.taskId, taskId), inArray(schema.outreachDrafts.status, ["draft", "blocked", "approved"])))
    .limit(1);
  if (existing[0]) return { status: "exists" };

  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, row.task.workspaceId)).limit(1);
  if (!workspace || (row.step.channel === "email" && !senderIsComplete(workspace))) return { status: "skipped", reason: "sender details missing" };
  const suppression = await loadSuppression(row.task.workspaceId);
  if (isSuppressed({ email: row.lead.email, companyDomain: row.lead.companyDomain }, suppression)) return { status: "skipped", reason: "suppressed" };
  const [play] = await db.select().from(schema.plays).where(eq(schema.plays.id, row.lead.playId)).limit(1);
  const [profile] = play ? await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.id, play.companyProfileId)).limit(1) : [];
  if (!profile) return { status: "skipped", reason: "profile missing" };

  // earlier steps of this enrollment that were actually sent
  const earlier = await db
    .select({ body: schema.outreachDrafts.body })
    .from(schema.outreachDrafts)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.outreachDrafts.taskId))
    .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.tasks.stepId))
    .where(and(eq(schema.tasks.enrollmentId, row.task.enrollmentId), lt(schema.sequenceSteps.position, row.step.position), eq(schema.outreachDrafts.status, "sent_manually")))
    .orderBy(asc(schema.sequenceSteps.position));

  const generated = await generateDraft({
    lead: row.lead,
    profile,
    sender: workspace,
    channel: row.step.channel,
    stepNumber: row.step.position,
    intent: row.step.intent ?? (row.step.position === 1 ? "first touch" : "follow-up"),
    previousBodies: earlier.map((e) => e.body),
  });

  const ok = await db
    .transaction(async (tx) => {
      const [draft] = await tx
        .insert(schema.outreachDrafts)
        .values({
          leadId: row.lead.id,
          workspaceId: row.task.workspaceId,
          taskId,
          channel: row.step.channel,
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
        { workspaceId: row.task.workspaceId, amount: CREDIT_COSTS.draft, action: "draft", reason: `Draft written: ${row.lead.company} (step ${row.step.position})`, refType: "draft", refId: draft.id, idempotencyKey: `draft:${draft.id}:draft` },
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
  if (!ok) return { status: "skipped", reason: "out of credits" };
  return { status: generated.blockReasons.length ? "blocked" : "drafted" };
}
