import { after } from "next/server";
import { env } from "@/lib/env";
import "@/lib/jobs/handlers";
import { JOB_ENRICH_LEADS } from "@/lib/jobs/handlers";
import { enqueue, runJobNow } from "@/lib/jobs/queue";

export async function startEnrichment(workspaceId: string, leadIds: string[]): Promise<void> {
  const job = await enqueue(JOB_ENRICH_LEADS, { workspaceId, leadIds });
  if (env().JOBS_INLINE === "true") {
    after(async () => {
      try {
        await runJobNow(job.id);
      } catch (e) {
        console.error("[jobs] inline enrichment failed", e);
      }
    });
  }
}
