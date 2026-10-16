import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import "@/lib/jobs/handlers";
import { JOB_PLAY_RUN } from "@/lib/jobs/handlers";
import { enqueue, runJobNow } from "@/lib/jobs/queue";

/** Queue a play run (and run it inline after the response in dev). */
export async function startPlayRun(playId: string): Promise<void> {
  await db.update(schema.plays).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(schema.plays.id, playId));
  const job = await enqueue(JOB_PLAY_RUN, { playId });
  if (env().JOBS_INLINE === "true") {
    after(async () => {
      try {
        await runJobNow(job.id);
      } catch (e) {
        console.error("[jobs] inline play run failed", e);
      }
    });
  }
}
