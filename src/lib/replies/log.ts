import { and, eq } from "drizzle-orm";
import { BELIEF_STAGES, type BeliefStage } from "@/config/outreach";
import { db, schema } from "@/lib/db/client";
import { normalizeEmail } from "@/lib/outreach/suppression";
import { stopEnrollmentsForLead } from "@/lib/sequences/tasks";

export type ReplyOutcome = (typeof schema.replyOutcomeEnum.enumValues)[number];
export type ObjectionType = (typeof schema.objectionTypeEnum.enumValues)[number];

export type LogReplyInput = {
  workspaceId: string;
  leadId: string;
  loggedBy: string;
  channel: "email" | "linkedin_connect" | "linkedin_message";
  outcome: ReplyOutcome;
  objectionType?: ObjectionType | null;
  replyText?: string | null;
  /** The stage the reply shows the lead has reached; defaults from the outcome. */
  beliefStage?: BeliefStage | null;
};

export type LogReplyResult = { replyId: string; stoppedEnrollments: number; suppressed: boolean; beliefStage: BeliefStage };

/** What a reply outcome implies about the belief ladder, if the user doesn't say. */
export function impliedStage(current: BeliefStage, outcome: ReplyOutcome): BeliefStage {
  const i = BELIEF_STAGES.indexOf(current);
  if (outcome === "meeting_booked") return BELIEF_STAGES[Math.max(i, 2)]; // at least solution_preference
  if (outcome === "positive") return BELIEF_STAGES[Math.min(i + 1, BELIEF_STAGES.length - 1)];
  return current;
}

/**
 * Record a reply. Side effects, all in one place:
 *  - any reply stops the lead's active sequences (opt-out as "opted_out", else "replied")
 *  - opt-out adds the email to the suppression list (or marks the lead suppressed when there is no email)
 *  - bounced clears the email so it isn't reused
 *  - the lead's belief stage moves up, never down, based on the outcome or the user's choice
 */
export async function logReply(input: LogReplyInput): Promise<LogReplyResult> {
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.workspaceId, input.workspaceId))).limit(1);
  if (!lead) throw new Error("Lead not found.");
  const [enrollment] = await db
    .select({ id: schema.sequenceEnrollments.id })
    .from(schema.sequenceEnrollments)
    .where(and(eq(schema.sequenceEnrollments.leadId, lead.id), eq(schema.sequenceEnrollments.status, "active")))
    .limit(1);

  const [reply] = await db
    .insert(schema.leadReplies)
    .values({
      leadId: lead.id,
      workspaceId: input.workspaceId,
      enrollmentId: enrollment?.id ?? null,
      channel: input.channel,
      replyText: input.replyText?.trim() || null,
      objectionType: input.objectionType ?? null,
      outcome: input.outcome,
      loggedBy: input.loggedBy,
    })
    .returning({ id: schema.leadReplies.id });

  const stopped = await stopEnrollmentsForLead(lead.id, input.outcome === "opt_out" ? "opted_out" : "replied");

  let suppressed = false;
  const leadPatch: Partial<typeof schema.leads.$inferInsert> = { updatedAt: new Date() };
  if (input.outcome === "opt_out") {
    suppressed = true;
    if (lead.email) {
      await db.insert(schema.suppressionList).values({ workspaceId: input.workspaceId, email: normalizeEmail(lead.email), domain: null, reason: `Opted out (${input.channel})` }).onConflictDoNothing();
    }
    leadPatch.emailStatus = "suppressed";
  }
  if (input.outcome === "bounced" && lead.email) {
    leadPatch.signal = { ...(lead.signal ?? {}), bouncedEmail: lead.email, bouncedAt: new Date().toISOString() };
    leadPatch.email = null;
    leadPatch.emailStatus = "not_found";
  }

  const wanted = input.beliefStage ?? impliedStage(lead.beliefStage, input.outcome);
  const newStage = BELIEF_STAGES.indexOf(wanted) > BELIEF_STAGES.indexOf(lead.beliefStage) ? wanted : lead.beliefStage;
  if (newStage !== lead.beliefStage) leadPatch.beliefStage = newStage;

  await db.update(schema.leads).set(leadPatch).where(eq(schema.leads.id, lead.id));
  return { replyId: reply.id, stoppedEnrollments: stopped, suppressed, beliefStage: newStage };
}
