import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";

const url = process.env.DATABASE_URL;
let reachable = false;
let dbmod: typeof import("@/lib/db/client");
let q: typeof import("@/lib/jobs/queue");
const TYPE = `test_job_${Date.now()}`;

beforeAll(async () => {
  if (!url) return;
  try {
    dbmod = await import("@/lib/db/client");
    await dbmod.db.execute("select 1");
    reachable = true;
    q = await import("@/lib/jobs/queue");
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  if (reachable) await dbmod.db.delete(dbmod.schema.jobs).where(like(dbmod.schema.jobs.type, "test_job_%"));
});

describe.skipIf(!url)("job queue (integration)", () => {
  it("runs a job once, marks it succeeded, and never hands the same job to two claimers", async () => {
    if (!reachable) return;
    let runs = 0;
    q.registerHandler(TYPE + "_ok", async () => { runs++; });
    const job = await q.enqueue(TYPE + "_ok", { x: 1 });
    const [a, b] = await Promise.all([q.runJobNow(job.id), q.runJobNow(job.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(runs).toBe(1);
    const [row] = await dbmod.db.select().from(dbmod.schema.jobs).where(eq(dbmod.schema.jobs.id, job.id));
    expect(row.status).toBe("succeeded");
    expect(row.attempts).toBe(1);
  });

  it("retries a failing job with backoff, then fails after max attempts", async () => {
    if (!reachable) return;
    q.registerHandler(TYPE + "_fail", async () => { throw new Error("nope"); });
    const job = await q.enqueue(TYPE + "_fail", {}, { maxAttempts: 2 });
    await q.runJobNow(job.id);
    let [row] = await dbmod.db.select().from(dbmod.schema.jobs).where(eq(dbmod.schema.jobs.id, job.id));
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("nope");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now() + 30_000); // backed off
    expect(await q.runJobNow(job.id)).toBe(false); // not runnable yet
    await dbmod.db.update(dbmod.schema.jobs).set({ runAfter: new Date() }).where(eq(dbmod.schema.jobs.id, job.id));
    await q.runJobNow(job.id);
    [row] = await dbmod.db.select().from(dbmod.schema.jobs).where(eq(dbmod.schema.jobs.id, job.id));
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(2);
  });

  it("claimNext picks runnable jobs oldest-first and skips future ones", async () => {
    if (!reachable) return;
    q.registerHandler(TYPE + "_order", async () => {});
    const later = await q.enqueue(TYPE + "_order", { n: "later" }, { runAfter: new Date(Date.now() + 3600_000) });
    const first = await q.enqueue(TYPE + "_order", { n: "first" }, { runAfter: new Date(Date.now() - 2000) });
    const second = await q.enqueue(TYPE + "_order", { n: "second" }, { runAfter: new Date(Date.now() - 1000) });
    const ids: string[] = [];
    for (;;) {
      const j = await q.claimNext();
      if (!j) break;
      if (j.type === TYPE + "_order") ids.push(j.id);
      await q.runClaimedJob(j);
    }
    expect(ids.slice(0, 2)).toEqual([first.id, second.id]);
    expect(ids).not.toContain(later.id);
  });
});
