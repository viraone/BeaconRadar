import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { analyzeSite } from "@/lib/profile/analyzer";
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

export const handlersLoaded = true;
