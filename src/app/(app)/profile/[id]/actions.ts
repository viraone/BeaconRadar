"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { startSiteAnalysis } from "@/lib/profile/analysis-job";
import { linesToList, normalizeSizes } from "@/lib/profile/icp";
import { getProfile } from "@/lib/profile/save";

export type EditState = { saved?: boolean; error?: string } | undefined;

const editSchema = z.object({
  companyName: z.string().trim().max(120).optional(),
  summary: z.string().trim().max(2000).optional(),
  offering: z.string().trim().max(500).optional(),
  industries: z.string().optional(),
  companySizes: z.string().optional(),
  geographies: z.string().optional(),
  buyerTitles: z.string().optional(),
  painPoints: z.string().optional(),
  buyingSignals: z.string().optional(),
  disqualifiers: z.string().optional(),
});

export async function updateProfile(profileId: string, _prev: EditState, formData: FormData): Promise<EditState> {
  const ctx = await requireWorkspace(`/profile/${profileId}`);
  const profile = await getProfile(ctx.workspace.id, profileId);
  if (!profile) return { error: "Profile not found." };

  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  await db
    .update(schema.companyProfiles)
    .set({
      companyName: d.companyName || null,
      summary: d.summary || null,
      offering: d.offering || null,
      icp: {
        industries: linesToList(d.industries),
        companySizes: normalizeSizes(linesToList(d.companySizes)),
        geographies: linesToList(d.geographies),
        buyerTitles: linesToList(d.buyerTitles),
        painPoints: linesToList(d.painPoints),
        buyingSignals: linesToList(d.buyingSignals),
        disqualifiers: linesToList(d.disqualifiers),
      },
      // A profile the user has edited is "ready" even if the analysis failed.
      status: "ready",
      error: null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.companyProfiles.id, profileId), eq(schema.companyProfiles.workspaceId, ctx.workspace.id)));

  revalidatePath(`/profile/${profileId}`);
  return { saved: true };
}

export async function reanalyzeProfile(profileId: string) {
  const ctx = await requireWorkspace(`/profile/${profileId}`);
  const profile = await getProfile(ctx.workspace.id, profileId);
  if (!profile) return;
  if (profile.status === "analyzing" || profile.status === "pending") return; // already running
  await startSiteAnalysis(profileId);
  revalidatePath(`/profile/${profileId}`);
}

export async function deleteProfile(profileId: string) {
  const ctx = await requireWorkspace(`/profile/${profileId}`);
  await db
    .delete(schema.companyProfiles)
    .where(and(eq(schema.companyProfiles.id, profileId), eq(schema.companyProfiles.workspaceId, ctx.workspace.id)));
  revalidatePath("/profile");
  redirect("/profile");
}
