import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/** Rows the aggregation needs. Pure input so it can be unit-tested. */
export type MetricsInput = {
  /** One row per lead that has been contacted (a task marked done or a draft marked sent). */
  contacted: Array<{ leadId: string; playType: string; channels: string[]; stepsDone: number }>;
  replies: Array<{ leadId: string; outcome: string; objectionType: string | null; channel: string; stepsDoneAtReply: number | null; leadStage: string; playType: string }>;
  /** Enrollments that finished every step with no reply logged. */
  awaitingOutcome: number;
  target: { min: number; max: number };
};

export type Breakdown = Array<{ key: string; contacted: number; replies: number; positive: number }>;

export type Metrics = {
  contacted: number;
  replies: number;
  positive: number;
  meetings: number;
  replyRate: number | null;
  positiveRate: number | null;
  awaitingOutcome: number;
  target: { min: number; max: number; progress: number };
  byPlayType: Breakdown;
  byChannel: Breakdown;
  byStage: Breakdown;
  byStep: Breakdown;
  objections: Array<{ key: string; count: number }>;
  outcomes: Array<{ key: string; count: number }>;
};

const POSITIVE = new Set(["positive", "meeting_booked"]);

export function computeMetrics(input: MetricsInput): Metrics {
  const contactedIds = new Set(input.contacted.map((c) => c.leadId));
  const repliedIds = new Set(input.replies.map((r) => r.leadId));
  const positiveIds = new Set(input.replies.filter((r) => POSITIVE.has(r.outcome)).map((r) => r.leadId));
  const meetingIds = new Set(input.replies.filter((r) => r.outcome === "meeting_booked").map((r) => r.leadId));
  const contacted = contactedIds.size;

  const breakdown = (keyOfContact: (c: MetricsInput["contacted"][number]) => string[], keyOfReply: (r: MetricsInput["replies"][number]) => string): Breakdown => {
    const m = new Map<string, { contacted: Set<string>; replies: Set<string>; positive: Set<string> }>();
    const get = (k: string) => {
      if (!m.has(k)) m.set(k, { contacted: new Set(), replies: new Set(), positive: new Set() });
      return m.get(k)!;
    };
    for (const c of input.contacted) for (const k of keyOfContact(c)) get(k).contacted.add(c.leadId);
    for (const r of input.replies) {
      const g = get(keyOfReply(r));
      g.replies.add(r.leadId);
      if (POSITIVE.has(r.outcome)) g.positive.add(r.leadId);
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, contacted: v.contacted.size, replies: v.replies.size, positive: v.positive.size }))
      .sort((a, b) => b.contacted - a.contacted || a.key.localeCompare(b.key));
  };

  const count = (keys: Array<string | null>) => {
    const m = new Map<string, number>();
    for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };

  return {
    contacted,
    replies: repliedIds.size,
    positive: positiveIds.size,
    meetings: meetingIds.size,
    replyRate: contacted ? repliedIds.size / contacted : null,
    positiveRate: contacted ? positiveIds.size / contacted : null,
    awaitingOutcome: input.awaitingOutcome,
    target: { ...input.target, progress: Math.min(1, contacted / input.target.min) },
    byPlayType: breakdown((c) => [c.playType], (r) => r.playType),
    byChannel: breakdown((c) => c.channels, (r) => r.channel),
    byStage: breakdown(() => [], (r) => r.leadStage),
    byStep: breakdown((c) => [`step ${c.stepsDone}`], (r) => (r.stepsDoneAtReply == null ? "outside a sequence" : `step ${r.stepsDoneAtReply}`)),
    objections: count(input.replies.map((r) => r.objectionType)),
    outcomes: count(input.replies.map((r) => r.outcome)),
  };
}

export const PROSPECT_TARGET = { min: 30, max: 50 };

/** Load the rows for a workspace and aggregate. */
export async function loadMetrics(workspaceId: string): Promise<Metrics & { recent: Array<{ id: string; company: string; person: string | null; outcome: string; objectionType: string | null; channel: string; replyText: string | null; createdAt: Date }> }> {
  // contacted = tasks done + drafts sent manually, per lead
  const doneTasks = await db
    .select({ leadId: schema.tasks.leadId, channel: schema.tasks.channel, position: schema.sequenceSteps.position })
    .from(schema.tasks)
    .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.tasks.stepId))
    .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.status, "done")));
  const sentDrafts = await db
    .select({ leadId: schema.outreachDrafts.leadId, channel: schema.outreachDrafts.channel })
    .from(schema.outreachDrafts)
    .where(and(eq(schema.outreachDrafts.workspaceId, workspaceId), eq(schema.outreachDrafts.status, "sent_manually")));
  const leadIds = Array.from(new Set([...doneTasks.map((t) => t.leadId), ...sentDrafts.map((d) => d.leadId)]));
  const leadRows = leadIds.length
    ? await db
        .select({ id: schema.leads.id, stage: schema.leads.beliefStage, playType: schema.plays.type, company: schema.leads.company, person: schema.leads.person })
        .from(schema.leads)
        .innerJoin(schema.plays, eq(schema.plays.id, schema.leads.playId))
        .where(inArray(schema.leads.id, leadIds))
    : [];
  const leadInfo = new Map(leadRows.map((l) => [l.id, l]));
  const contacted = leadIds
    .filter((id) => leadInfo.has(id))
    .map((id) => ({
      leadId: id,
      playType: leadInfo.get(id)!.playType,
      channels: Array.from(new Set([...doneTasks.filter((t) => t.leadId === id).map((t) => t.channel), ...sentDrafts.filter((d) => d.leadId === id).map((d) => d.channel)])),
      stepsDone: Math.max(1, doneTasks.filter((t) => t.leadId === id).length),
    }));

  const replyRows = await db
    .select({ r: schema.leadReplies, stage: schema.leads.beliefStage, playType: schema.plays.type, company: schema.leads.company, person: schema.leads.person, currentPosition: schema.sequenceEnrollments.currentPosition })
    .from(schema.leadReplies)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.leadReplies.leadId))
    .innerJoin(schema.plays, eq(schema.plays.id, schema.leads.playId))
    .leftJoin(schema.sequenceEnrollments, eq(schema.sequenceEnrollments.id, schema.leadReplies.enrollmentId))
    .where(eq(schema.leadReplies.workspaceId, workspaceId))
    .orderBy(sql`${schema.leadReplies.createdAt} desc`);
  const replies = replyRows.map((x) => ({
    leadId: x.r.leadId,
    outcome: x.r.outcome,
    objectionType: x.r.objectionType,
    channel: x.r.channel,
    stepsDoneAtReply: x.r.enrollmentId ? doneTasks.filter((t) => t.leadId === x.r.leadId).length || x.currentPosition || null : null,
    leadStage: x.stage,
    playType: x.playType,
  }));

  const [awaiting] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.sequenceEnrollments)
    .where(
      and(
        eq(schema.sequenceEnrollments.workspaceId, workspaceId),
        eq(schema.sequenceEnrollments.status, "completed"),
        sql`not exists (select 1 from lead_replies lr where lr.lead_id = ${schema.sequenceEnrollments.leadId})`,
      ),
    );

  return {
    ...computeMetrics({ contacted, replies, awaitingOutcome: awaiting?.n ?? 0, target: PROSPECT_TARGET }),
    recent: replyRows.slice(0, 20).map((x) => ({ id: x.r.id, company: x.company, person: x.person, outcome: x.r.outcome, objectionType: x.r.objectionType, channel: x.r.channel, replyText: x.r.replyText, createdAt: x.r.createdAt })),
  };
}
