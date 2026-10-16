"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/workspace";
import { enrollLeads } from "@/lib/sequences/enroll";
import { addStep, ensureDefaultSequence, removeLastStep, updateStep } from "@/lib/sequences/sequences";
import { startTaskDrafts } from "@/lib/outreach/start";

export type SeqResult = { error?: string; ok?: boolean; message?: string } | undefined;

const channelSchema = z.enum(["email", "linkedin_connect", "linkedin_message"]);

export async function saveStep(stepId: string, formData: FormData): Promise<SeqResult> {
  const ctx = await requireWorkspace("/sequences");
  const parsed = z.object({ waitDays: z.coerce.number().int().min(0).max(90), intent: z.string().trim().max(120), channel: channelSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    await updateStep(ctx.workspace.id, stepId, parsed.data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/sequences");
  return { ok: true, message: "Saved." };
}

export async function appendStep(sequenceId: string, formData: FormData): Promise<SeqResult> {
  const ctx = await requireWorkspace("/sequences");
  const parsed = z.object({ waitDays: z.coerce.number().int().min(0).max(90).default(7), intent: z.string().trim().max(120).default("follow-up with something new"), channel: channelSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    await addStep(ctx.workspace.id, sequenceId, parsed.data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/sequences");
  return { ok: true };
}

export async function dropLastStep(sequenceId: string): Promise<SeqResult> {
  const ctx = await requireWorkspace("/sequences");
  try {
    await removeLastStep(ctx.workspace.id, sequenceId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/sequences");
  return { ok: true };
}

/** Enroll selected leads in the default sequence and draft their first step. */
export async function enrollLeadsAction(playId: string, leadIds: string[]): Promise<SeqResult> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  if (leadIds.length === 0) return { error: "Select at least one lead." };
  const seq = await ensureDefaultSequence(ctx.workspace.id);
  let outcomes;
  try {
    outcomes = await enrollLeads({ workspaceId: ctx.workspace.id, userId: ctx.user.id, sequenceId: seq.id, leadIds });
  } catch (e) {
    return { error: (e as Error).message };
  }
  const enrolled = outcomes.filter((o) => o.ok);
  await startTaskDrafts(enrolled.map((o) => o.taskId!));
  revalidatePath(`/plays/${playId}`);
  revalidatePath("/tasks");
  const skipped = outcomes.filter((o) => !o.ok);
  const detail = skipped.slice(0, 4).map((o) => `${o.person ?? o.company}: ${o.reason}`).join("; ");
  if (enrolled.length === 0) return { error: `Nothing enrolled. ${detail}` };
  return { ok: true, message: `Enrolled ${enrolled.length} in "${seq.name}". First tasks are on the Tasks page (drafting now).${skipped.length ? ` Skipped ${skipped.length}: ${detail}` : ""}` };
}
