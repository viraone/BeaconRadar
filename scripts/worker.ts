/**
 * Background worker: `npm run worker`. Polls the jobs table and runs handlers.
 * In development the app also runs jobs inline right after enqueueing them
 * (JOBS_INLINE=true), so this process is optional locally and required in production.
 */
import "@/lib/jobs/handlers";
import { claimNext, runClaimedJob } from "@/lib/jobs/queue";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.log(`[worker] started, polling every ${POLL_MS}ms`);
  while (!stopping) {
    const job = await claimNext();
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    console.log(`[worker] running ${job.type} ${job.id} (attempt ${job.attempts})`);
    const t = Date.now();
    await runClaimedJob(job);
    console.log(`[worker] finished ${job.type} ${job.id} in ${Date.now() - t}ms`);
  }
  console.log("[worker] stopped");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
