import { after } from "next/server";
import { env } from "@/lib/env";
import "@/lib/jobs/handlers";
import { JOB_DRAFT_OUTREACH, JOB_DRAFT_TASK } from "@/lib/jobs/handlers";
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

/** Queue drafting for sequence tasks (1 credit each; existing drafts are kept). */
export async function startTaskDrafts(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const job = await enqueue(JOB_DRAFT_TASK, { taskIds });
  if (env().JOBS_INLINE === "true") {
    after(async () => {
      try {
        await runJobNow(job.id);
      } catch (e) {
        console.error("[jobs] inline task drafting failed", e);
      }
    });
  }
}
