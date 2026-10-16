"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/workspace";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { startTaskDrafts } from "@/lib/outreach/start";
import { completeTask, skipTask, stopEnrollment } from "@/lib/sequences/tasks";

export type TaskResult = { error?: string; ok?: boolean; message?: string } | undefined;

export async function markTaskDone(taskId: string): Promise<TaskResult> {
  const ctx = await requireWorkspace("/tasks");
  const r = await completeTask({ taskId, userId: ctx.user.id, workspaceId: ctx.workspace.id, timeZone: ctx.workspace.timezone, dailySendCap: ctx.workspace.dailySendCap });
  revalidatePath("/tasks");
  if (!r.ok) return { error: r.reason };
  if (r.next === "scheduled") {
    // draft the next step now so it's ready when it comes due
    const [next] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.workspaceId, ctx.workspace.id), eq(schema.tasks.status, "pending"), eq(schema.tasks.dueAt, r.nextDueAt!)))
      .limit(1);
    if (next) await startTaskDrafts([next.id]);
    return { ok: true, message: `Done. Next step due ${r.nextDueAt!.toLocaleDateString(undefined, { timeZone: ctx.workspace.timezone, weekday: "short", month: "short", day: "numeric" })}.` };
  }
  return { ok: true, message: r.next === "completed" ? "Done. That was the last step." : "This sequence has stopped." };
}

export async function skipTaskAction(taskId: string): Promise<TaskResult> {
  const ctx = await requireWorkspace("/tasks");
  const r = await skipTask({ taskId, workspaceId: ctx.workspace.id, timeZone: ctx.workspace.timezone });
  revalidatePath("/tasks");
  return r.ok ? { ok: true, message: "Skipped." } : { error: r.reason };
}

export async function stopSequenceAction(enrollmentId: string): Promise<TaskResult> {
  const ctx = await requireWorkspace("/tasks");
  const [e] = await db.select({ id: schema.sequenceEnrollments.id }).from(schema.sequenceEnrollments).where(and(eq(schema.sequenceEnrollments.id, enrollmentId), eq(schema.sequenceEnrollments.workspaceId, ctx.workspace.id))).limit(1);
  if (!e) return { error: "Not found." };
  await stopEnrollment(enrollmentId, "manual");
  revalidatePath("/tasks");
  return { ok: true, message: "Sequence stopped." };
}

export async function draftTaskAction(taskId: string): Promise<TaskResult> {
  const ctx = await requireWorkspace("/tasks");
  const [t] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.workspaceId, ctx.workspace.id))).limit(1);
  if (!t) return { error: "Not found." };
  if ((await getBalance(ctx.workspace.id)) < 1) return { error: "Not enough credits (1 per draft)." };
  await startTaskDrafts([taskId]);
  revalidatePath("/tasks");
  return { ok: true, message: "Drafting…" };
}

/** Discard the task's current draft and write a new one. */
export async function redraftTaskAction(taskId: string): Promise<TaskResult> {
  const ctx = await requireWorkspace("/tasks");
  if ((await getBalance(ctx.workspace.id)) < 1) return { error: "Not enough credits (1 per draft)." };
  await db.update(schema.outreachDrafts).set({ status: "discarded", updatedAt: new Date() }).where(and(eq(schema.outreachDrafts.taskId, taskId), eq(schema.outreachDrafts.workspaceId, ctx.workspace.id)));
  await startTaskDrafts([taskId]);
  revalidatePath("/tasks");
  return { ok: true, message: "Regenerating…" };
}
