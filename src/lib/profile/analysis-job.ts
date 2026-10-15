import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import "@/lib/jobs/handlers";
import { JOB_SITE_ANALYSIS } from "@/lib/jobs/handlers";
import { enqueue, runJobNow } from "@/lib/jobs/queue";

/**
 * Queue a site analysis for a profile. Call from Server Actions or Route Handlers.
 * With JOBS_INLINE=true (dev default) the job also runs in this process after the
 * response is sent, so no worker is needed locally.
 */
export async function startSiteAnalysis(profileId: string): Promise<void> {
  await db.update(schema.companyProfiles).set({ status: "pending", error: null, updatedAt: new Date() }).where(eq(schema.companyProfiles.id, profileId));
  const job = await enqueue(JOB_SITE_ANALYSIS, { profileId });
  if (env().JOBS_INLINE === "true") {
    after(async () => {
      try {
        await runJobNow(job.id);
      } catch (e) {
        console.error("[jobs] inline run failed", e);
      }
    });
  }
}
