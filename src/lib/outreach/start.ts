import { after } from "next/server";
import { env } from "@/lib/env";
import "@/lib/jobs/handlers";
import { JOB_DRAFT_OUTREACH } from "@/lib/jobs/handlers";
import { enqueue, runJobNow } from "@/lib/jobs/queue";
import type { Channel } from "./validators";

export async function startDrafting(workspaceId: string, leadIds: string[], channel: Channel = "email"): Promise<void> {
  const job = await enqueue(JOB_DRAFT_OUTREACH, { workspaceId, leadIds, channel });
  if (env().JOBS_INLINE === "true") {
    after(async () => {
      try {
        await runJobNow(job.id);
      } catch (e) {
        console.error("[jobs] inline drafting failed", e);
      }
    });
  }
}
