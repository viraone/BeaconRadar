import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { analyzeSite } from "@/lib/profile/analyzer";
import { runPlay } from "@/lib/plays/runner";
import { enrichLeads } from "@/lib/enrichment/runner";
import { draftForLeads, draftForTask } from "@/lib/outreach/runner";
import type { Channel } from "@/lib/outreach/validators";
import { registerHandler } from "./queue";

/**
 * All job handlers live here and are registered once per process by importing
 * this module. Keep handlers idempotent: a retried job must not double-write.
 */

export const JOB_SITE_ANALYSIS = "site_analysis";

registerHandler<{ profileId: string }>(JOB_SITE_ANALYSIS, async ({ profileId }) => {
  const [profile] = await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.id, profileId)).limit(1);
  if (!profile) return; // deleted meanwhile: nothing to do

  await db.update(schema.companyProfiles).set({ status: "analyzing", error: null, updatedAt: new Date() }).where(eq(schema.companyProfiles.id, profileId));

  try {
    const result = await analyzeSite(profile.siteUrl);
    await db
      .update(schema.companyProfiles)
      .set({
        companyName: result.companyName,
        summary: result.summary,
        offering: result.offering,
        icp: result.icp,
        sourceUrls: result.sourceUrls,
        analysisModel: result.provider === "mock" ? "mock" : result.model,
        analyzedAt: new Date(),
        status: "ready",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.companyProfiles.id, profileId));
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    await db
      .update(schema.companyProfiles)
      .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(schema.companyProfiles.id, profileId));
    throw e; // let the queue record the failure/backoff too
  }
});

export const JOB_PLAY_RUN = "play_run";

registerHandler<{ playId: string }>(JOB_PLAY_RUN, async ({ playId }) => {
  await runPlay(playId);
});

export const JOB_ENRICH_LEADS = "enrich_leads";

registerHandler<{ workspaceId: string; leadIds: string[] }>(JOB_ENRICH_LEADS, async ({ workspaceId, leadIds }) => {
  const summary = await enrichLeads(workspaceId, leadIds);
  console.log(`[enrich] ${JSON.stringify(summary)}`);
});

export const JOB_DRAFT_OUTREACH = "draft_outreach";

registerHandler<{ workspaceId: string; leadIds: string[]; channel: Channel }>(JOB_DRAFT_OUTREACH, async ({ workspaceId, leadIds, channel }) => {
  const summary = await draftForLeads(workspaceId, leadIds, channel ?? "email");
  console.log(`[draft] ${JSON.stringify(summary)}`);
});

export const JOB_DRAFT_TASK = "draft_task";

registerHandler<{ taskIds: string[] }>(JOB_DRAFT_TASK, async ({ taskIds }) => {
  for (const id of taskIds) {
    const r = await draftForTask(id);
    console.log(`[draft_task] ${id}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`);
  }
});

export const handlersLoaded = true;
