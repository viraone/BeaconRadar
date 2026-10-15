import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Minimal Postgres-backed job queue. One table, `FOR UPDATE SKIP LOCKED` claims,
 * exponential backoff, no extra services. Handlers are registered by type.
 * Behind `enqueue()` so it can be swapped for Inngest/Trigger.dev later.
 */

export type Job = typeof schema.jobs.$inferSelect;
export type JobHandler<P = Record<string, unknown>> = (payload: P, job: Job) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler<P extends Record<string, unknown>>(type: string, handler: JobHandler<P>) {
  handlers.set(type, handler as JobHandler);
}

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { runAfter?: Date; maxAttempts?: number } = {}): Promise<Job> {
  const [job] = await db
    .insert(schema.jobs)
    .values({ type, payload, runAfter: opts.runAfter ?? new Date(), maxAttempts: opts.maxAttempts ?? 3 })
    .returning();
  return job;
}

/** Atomically claim the next runnable job, or null. */
export async function claimNext(): Promise<Job | null> {
  const rows = await db.execute<Job>(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs
      where status = 'queued' and run_after <= now()
      order by run_after asc
      for update skip locked
      limit 1
    )
    returning *`);
  const row = (rows as unknown as { rows?: Job[] }).rows ?? (rows as unknown as Job[]);
  const job = Array.isArray(row) ? row[0] : undefined;
  return job ? normalize(job) : null;
}

/** Claim one specific job (used for inline execution right after enqueue). */
export async function claimById(id: string): Promise<Job | null> {
  const [job] = await db
    .update(schema.jobs)
    .set({ status: "running", lockedAt: new Date(), attempts: sql`${schema.jobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "queued"), lte(schema.jobs.runAfter, new Date())))
    .returning();
  return job ?? null;
}

export async function runClaimedJob(job: Job): Promise<void> {
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    await handler(job.payload as Record<string, unknown>, job);
    await db.update(schema.jobs).set({ status: "succeeded", lockedAt: null, lastError: null, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    const exhausted = job.attempts >= job.maxAttempts;
    const backoffMs = Math.min(60_000 * 2 ** (job.attempts - 1), 30 * 60_000);
    await db
      .update(schema.jobs)
      .set({
        status: exhausted ? "failed" : "queued",
        lockedAt: null,
        lastError: message.slice(0, 2000),
        runAfter: exhausted ? job.runAfter : new Date(Date.now() + backoffMs),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
    console.error(`[jobs] ${job.type} ${job.id} attempt ${job.attempts}/${job.maxAttempts} failed: ${message}`);
  }
}

/** Run a job right now in this process if it is still queued. Safe to race with a worker. */
export async function runJobNow(id: string): Promise<boolean> {
  const job = await claimById(id);
  if (!job) return false;
  await runClaimedJob(job);
  return true;
}

/** Process queued jobs until the queue is empty. Returns how many ran. */
export async function drain(max = 100): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimNext();
    if (!job) break;
    await runClaimedJob(job);
    n++;
  }
  return n;
}

// drizzle's execute() returns snake_case rows; map to the schema's camelCase shape.
function normalize(row: Record<string, unknown>): Job {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    type: r.type,
    payload: r.payload,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts ?? r.maxAttempts,
    runAfter: r.run_after ?? r.runAfter,
    lockedAt: r.locked_at ?? r.lockedAt,
    lastError: r.last_error ?? r.lastError,
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  } as Job;
}
