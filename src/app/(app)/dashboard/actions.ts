"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BELIEF_STAGES } from "@/config/outreach";
import { requireWorkspace } from "@/lib/auth/workspace";
import { logReply } from "@/lib/replies/log";

export type ReplyResult = { error?: string; ok?: boolean; message?: string } | undefined;

const schema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["email", "linkedin_connect", "linkedin_message"]),
  outcome: z.enum(["positive", "neutral", "negative", "meeting_booked", "opt_out", "wrong_person", "bounced"]),
  objectionType: z.enum(["authority", "no_need", "status_quo", "timing", "price_value", "no_budget", "trial_request", "solution_specific", "competitor", "other", ""]).optional(),
  replyText: z.string().max(4000).optional(),
  beliefStage: z.enum([...BELIEF_STAGES, ""]).optional(),
});

export async function logReplyAction(formData: FormData): Promise<ReplyResult> {
  const ctx = await requireWorkspace("/dashboard");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  try {
    const r = await logReply({
      workspaceId: ctx.workspace.id,
      leadId: d.leadId,
      loggedBy: ctx.user.id,
      channel: d.channel,
      outcome: d.outcome,
      objectionType: d.objectionType || null,
      replyText: d.replyText || null,
      beliefStage: d.beliefStage || null,
    });
    for (const p of ["/dashboard", "/tasks", "/drafts", "/plays", "/settings"]) revalidatePath(p);
    const bits = [`Logged ${d.outcome.replace("_", " ")}.`];
    if (r.stoppedEnrollments) bits.push(`Stopped ${r.stoppedEnrollments} sequence${r.stoppedEnrollments === 1 ? "" : "s"}.`);
    if (r.suppressed) bits.push("Added to the suppression list.");
    bits.push(`Belief stage: ${r.beliefStage.replace("_", " ")}.`);
    return { ok: true, message: bits.join(" ") };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
