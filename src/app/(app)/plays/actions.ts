"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PLANS } from "@/config/credits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { estimatePlayCredits } from "@/lib/credits/estimate";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { recommendPlays } from "@/lib/plays/recommend";
import { getPlay } from "@/lib/plays/registry";
import { startPlayRun } from "@/lib/plays/start";
import { getProfile } from "@/lib/profile/save";
import { emptyIcp, cleanList } from "@/lib/profile/icp";

export type ActionResult = { error?: string; ok?: boolean } | undefined;

export async function recommendForProfile(profileId: string): Promise<ActionResult> {
  const ctx = await requireWorkspace("/plays");
  const profile = await getProfile(ctx.workspace.id, profileId);
  if (!profile) return { error: "Profile not found." };
  const icp = profile.icp ?? emptyIcp();
  if (!icp.buyerTitles.length && !icp.buyingSignals.length && !icp.industries.length) {
    return { error: "Fill in the profile's buyer titles, buying signals or industries first, then recommend plays." };
  }

  let recs;
  try {
    recs = await recommendPlays({ companyName: profile.companyName, summary: profile.summary, offering: profile.offering, icp, workspaceId: ctx.workspace.id });
  } catch (e) {
    return { error: `Could not get recommendations: ${(e as Error).message}` };
  }
  if (recs.length === 0) return { error: "No plays could be built from this profile yet." };

  const rowLimit = PLANS[ctx.workspace.plan].rowsPerTable;
  await db.insert(schema.plays).values(
    recs.map((r) => ({
      workspaceId: ctx.workspace.id,
      companyProfileId: profile.id,
      type: r.type,
      title: r.title,
      rationale: r.rationale,
      params: r.params,
      status: "draft" as const,
      rowLimit,
      creditEstimate: estimatePlayCredits(r.type, rowLimit, ctx.workspace.plan),
    })),
  );
  revalidatePath("/plays");
  return { ok: true };
}

export async function updateHiringRoles(playId: string, rolesText: string): Promise<ActionResult> {
  const ctx = await requireWorkspace("/plays");
  const roles = cleanList(rolesText.split(/[\n,]/), 80, 5);
  if (roles.length === 0) return { error: "Enter at least one role." };
  await db
    .update(schema.plays)
    .set({ params: { roles }, updatedAt: new Date() })
    .where(and(eq(schema.plays.id, playId), eq(schema.plays.workspaceId, ctx.workspace.id), eq(schema.plays.status, "draft")));
  revalidatePath("/plays");
  return { ok: true };
}

export async function approvePlay(playId: string): Promise<ActionResult> {
  const ctx = await requireWorkspace("/plays");
  const [play] = await db.select().from(schema.plays).where(and(eq(schema.plays.id, playId), eq(schema.plays.workspaceId, ctx.workspace.id))).limit(1);
  if (!play) return { error: "Play not found." };
  if (!["draft", "failed", "partial", "completed"].includes(play.status)) return { error: "This play is already running." };
  const def = getPlay(play.type);
  if (!def.runnable) return { error: `${def.label} isn't available yet.` };
  try {
    def.parseParams(play.params);
  } catch {
    return { error: "This play's settings are incomplete. Edit them first." };
  }
  const balance = await getBalance(ctx.workspace.id);
  if (balance <= 0) return { error: "You have no credits left." };
  await startPlayRun(playId);
  revalidatePath("/plays");
  revalidatePath(`/plays/${playId}`);
  return { ok: true };
}

export async function deletePlay(playId: string): Promise<ActionResult> {
  const ctx = await requireWorkspace("/plays");
  await db.delete(schema.plays).where(and(eq(schema.plays.id, playId), eq(schema.plays.workspaceId, ctx.workspace.id)));
  revalidatePath("/plays");
  return { ok: true };
}
