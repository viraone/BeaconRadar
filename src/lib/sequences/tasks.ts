import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { checkDailyCap } from "./limits";
import { evaluateStop, type StopReason } from "./stop";
import { endOfLocalDay, nextDueAt, startOfLocalDay } from "./timing";

export type TaskRow = typeof schema.tasks.$inferSelect;

export async function countDoneToday(ownerUserId: string, workspaceId: string, timeZone: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.ownerUserId, ownerUserId),
        eq(schema.tasks.workspaceId, workspaceId),
        eq(schema.tasks.status, "done"),
        gte(schema.tasks.completedAt, startOfLocalDay(now, timeZone)),
        lt(schema.tasks.completedAt, endOfLocalDay(now, timeZone)),
      ),
    );
  return row?.n ?? 0;
}

/** Pending tasks due by the end of today (local), oldest first, plus the rest for an "upcoming" list. */
export async function listTasks(ownerUserId: string, workspaceId: string, timeZone: string, now = new Date()) {
  const rows = await db
    .select({ task: schema.tasks, lead: schema.leads, step: schema.sequenceSteps, enrollment: schema.sequenceEnrollments })
    .from(schema.tasks)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.tasks.leadId))
    .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.tasks.stepId))
    .innerJoin(schema.sequenceEnrollments, eq(schema.sequenceEnrollments.id, schema.tasks.enrollmentId))
    .where(and(eq(schema.tasks.ownerUserId, ownerUserId), eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.status, "pending")))
    .orderBy(asc(schema.tasks.dueAt));
  const cutoff = endOfLocalDay(now, timeZone).getTime();
  const taskIds = rows.map((r) => r.task.id);
  const drafts = taskIds.length
    ? await db.select().from(schema.outreachDrafts).where(and(inArray(schema.outreachDrafts.taskId, taskIds), sql`${schema.outreachDrafts.status} <> 'discarded'`)).orderBy(desc(schema.outreachDrafts.createdAt))
    : [];
  const draftByTask = new Map<string, (typeof drafts)[number]>();
  for (const d of drafts) if (d.taskId && !draftByTask.has(d.taskId)) draftByTask.set(d.taskId, d);
  const overdueBefore = now.getTime() - 24 * 3600 * 1000;
  const withDrafts = rows.map((r) => ({ ...r, draft: draftByTask.get(r.task.id) ?? null, overdue: r.task.dueAt.getTime() < overdueBefore }));
  return {
    today: withDrafts.filter((r) => r.task.dueAt.getTime() < cutoff),
    upcoming: withDrafts.filter((r) => r.task.dueAt.getTime() >= cutoff),
  };
}

export type CompleteResult = { ok: true; next: "scheduled" | "completed" | "stopped"; nextDueAt?: Date } | { ok: false; reason: string };

/**
 * Mark a task done ("I sent it"). Enforces the daily cap, re-checks stop
 * conditions, then schedules the next step `wait_days` later or completes the
 * enrollment. Also marks the task's draft as sent.
 */
export async function completeTask(input: { taskId: string; userId: string; workspaceId: string; timeZone: string; dailySendCap: number; now?: Date }): Promise<CompleteResult> {
  const now = input.now ?? new Date();
  const [task] = await db.select().from(schema.tasks).where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.workspaceId, input.workspaceId))).limit(1);
  if (!task) return { ok: false, reason: "Task not found." };
  if (task.status !== "pending") return { ok: false, reason: `Task is already ${task.status}.` };

  const cap = checkDailyCap(input.dailySendCap, await countDoneToday(input.userId, input.workspaceId, input.timeZone, now));
  if (!cap.ok) return { ok: false, reason: cap.reason };

  const stop = await stopSignals(task.enrollmentId);
  if (stop) {
    await stopEnrollment(task.enrollmentId, stop);
    return { ok: true, next: "stopped" };
  }

  const [enrollment] = await db.select().from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.id, task.enrollmentId)).limit(1);
  const steps = await db.select().from(schema.sequenceSteps).where(eq(schema.sequenceSteps.sequenceId, enrollment.sequenceId)).orderBy(asc(schema.sequenceSteps.position));
  const current = steps.find((s) => s.id === task.stepId);
  const next = steps.find((s) => s.position === (current?.position ?? enrollment.currentPosition) + 1);

  return db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ status: "done", completedAt: now, updatedAt: now }).where(eq(schema.tasks.id, task.id));
    await tx
      .update(schema.outreachDrafts)
      .set({ status: "sent_manually", updatedAt: now })
      .where(and(eq(schema.outreachDrafts.taskId, task.id), inArray(schema.outreachDrafts.status, ["draft", "approved"])));
    if (!next) {
      await tx.update(schema.sequenceEnrollments).set({ status: "completed", nextDueAt: null, updatedAt: now }).where(eq(schema.sequenceEnrollments.id, enrollment.id));
      return { ok: true, next: "completed" } as const;
    }
    const due = nextDueAt(now, next.waitDays, input.timeZone);
    await tx
      .insert(schema.tasks)
      .values({ enrollmentId: enrollment.id, stepId: next.id, leadId: task.leadId, workspaceId: task.workspaceId, ownerUserId: task.ownerUserId, channel: next.channel, dueAt: due, status: "pending" });
    await tx.update(schema.sequenceEnrollments).set({ currentPosition: next.position, nextDueAt: due, updatedAt: now }).where(eq(schema.sequenceEnrollments.id, enrollment.id));
    return { ok: true, next: "scheduled", nextDueAt: due } as const;
  });
}

/** Skip a task without counting it as a send; the sequence still advances. */
export async function skipTask(input: { taskId: string; workspaceId: string; timeZone: string; now?: Date }): Promise<CompleteResult> {
  const now = input.now ?? new Date();
  const [task] = await db.select().from(schema.tasks).where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.workspaceId, input.workspaceId))).limit(1);
  if (!task || task.status !== "pending") return { ok: false, reason: "Task not found or not pending." };
  const [enrollment] = await db.select().from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.id, task.enrollmentId)).limit(1);
  const steps = await db.select().from(schema.sequenceSteps).where(eq(schema.sequenceSteps.sequenceId, enrollment.sequenceId)).orderBy(asc(schema.sequenceSteps.position));
  const current = steps.find((s) => s.id === task.stepId);
  const next = steps.find((s) => s.position === (current?.position ?? 0) + 1);
  return db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ status: "skipped", completedAt: now, updatedAt: now }).where(eq(schema.tasks.id, task.id));
    await tx.update(schema.outreachDrafts).set({ status: "discarded", updatedAt: now }).where(and(eq(schema.outreachDrafts.taskId, task.id), inArray(schema.outreachDrafts.status, ["draft", "approved", "blocked"])));
    if (!next) {
      await tx.update(schema.sequenceEnrollments).set({ status: "completed", nextDueAt: null, updatedAt: now }).where(eq(schema.sequenceEnrollments.id, enrollment.id));
      return { ok: true, next: "completed" } as const;
    }
    const due = nextDueAt(now, next.waitDays, input.timeZone);
    await tx.insert(schema.tasks).values({ enrollmentId: enrollment.id, stepId: next.id, leadId: task.leadId, workspaceId: task.workspaceId, ownerUserId: task.ownerUserId, channel: next.channel, dueAt: due, status: "pending" });
    await tx.update(schema.sequenceEnrollments).set({ currentPosition: next.position, nextDueAt: due, updatedAt: now }).where(eq(schema.sequenceEnrollments.id, enrollment.id));
    return { ok: true, next: "scheduled", nextDueAt: due } as const;
  });
}

/** Stop an enrollment and cancel its open tasks (and discard their unsent drafts). */
export async function stopEnrollment(enrollmentId: string, reason: StopReason): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schema.sequenceEnrollments).set({ status: "stopped", stopReason: reason, nextDueAt: null, updatedAt: now }).where(and(eq(schema.sequenceEnrollments.id, enrollmentId), eq(schema.sequenceEnrollments.status, "active")));
    const open = await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.enrollmentId, enrollmentId), eq(schema.tasks.status, "pending")));
    if (open.length) {
      const ids = open.map((t) => t.id);
      await tx.update(schema.tasks).set({ status: "cancelled", updatedAt: now }).where(inArray(schema.tasks.id, ids));
      await tx.update(schema.outreachDrafts).set({ status: "discarded", updatedAt: now }).where(and(inArray(schema.outreachDrafts.taskId, ids), inArray(schema.outreachDrafts.status, ["draft", "approved", "blocked"])));
    }
  });
}

/** Stop every active enrollment for a lead (e.g. after a reply or opt-out). */
export async function stopEnrollmentsForLead(leadId: string, reason: StopReason): Promise<number> {
  const active = await db.select({ id: schema.sequenceEnrollments.id }).from(schema.sequenceEnrollments).where(and(eq(schema.sequenceEnrollments.leadId, leadId), eq(schema.sequenceEnrollments.status, "active")));
  for (const e of active) await stopEnrollment(e.id, reason);
  return active.length;
}

/** Has anything happened that should stop this enrollment? Replies are logged in Phase 8; suppression applies now. */
async function stopSignals(enrollmentId: string): Promise<StopReason | null> {
  const [row] = await db
    .select({ email: schema.leads.email, companyDomain: schema.leads.companyDomain, workspaceId: schema.leads.workspaceId, leadId: schema.leads.id })
    .from(schema.sequenceEnrollments)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.sequenceEnrollments.leadId))
    .where(eq(schema.sequenceEnrollments.id, enrollmentId))
    .limit(1);
  if (!row) return null;
  const { isSuppressed, loadSuppression } = await import("@/lib/outreach/suppression");
  const suppressed = isSuppressed({ email: row.email, companyDomain: row.companyDomain }, await loadSuppression(row.workspaceId));
  const replies = await db.select({ outcome: schema.leadReplies.outcome }).from(schema.leadReplies).where(eq(schema.leadReplies.leadId, row.leadId));
  return evaluateStop({ replied: replies.length > 0, optedOut: replies.some((r) => r.outcome === "opt_out"), suppressed });
}
