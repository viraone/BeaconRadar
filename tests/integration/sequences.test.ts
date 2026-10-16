import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { localDateKey } from "@/lib/sequences/timing";

const url = process.env.DATABASE_URL;
let reachable = false;
let dbmod: typeof import("@/lib/db/client");
let enroll: typeof import("@/lib/sequences/enroll");
let tasks: typeof import("@/lib/sequences/tasks");
let seqs: typeof import("@/lib/sequences/sequences");
let wsId: string, userId: string, playId: string, seqId: string;
const TZ = "America/Los_Angeles";

beforeAll(async () => {
  if (!url) return;
  try {
    dbmod = await import("@/lib/db/client");
    await dbmod.db.execute("select 1");
    reachable = true;
    enroll = await import("@/lib/sequences/enroll");
    tasks = await import("@/lib/sequences/tasks");
    seqs = await import("@/lib/sequences/sequences");
    const { db, schema } = dbmod;
    userId = crypto.randomUUID();
    await db.insert(schema.users).values({ id: userId, email: `seq-${userId}@example.com` });
    const [ws] = await db.insert(schema.workspaces).values({ name: "seq-test", timezone: TZ, maxContactsPerCompany: 2, dailySendCap: 2 }).returning();
    wsId = ws.id;
    const [profile] = await db.insert(schema.companyProfiles).values({ workspaceId: wsId, siteUrl: "https://t.example", domain: "t.example", status: "ready" }).returning();
    const [play] = await db.insert(schema.plays).values({ workspaceId: wsId, companyProfileId: profile.id, type: "hiring_signal", title: "t", params: { roles: ["x"] } }).returning();
    playId = play.id;
    seqId = (await seqs.ensureDefaultSequence(wsId)).id;
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  if (!reachable) return;
  await dbmod.db.delete(dbmod.schema.workspaces).where(eq(dbmod.schema.workspaces.id, wsId));
  await dbmod.db.delete(dbmod.schema.users).where(eq(dbmod.schema.users.id, userId));
});

async function lead(company: string, person: string | null, domain = `${company.toLowerCase()}.com`) {
  const [l] = await dbmod.db.insert(dbmod.schema.leads).values({ playId, workspaceId: wsId, company, companyDomain: domain, person, sourceUrls: ["https://src.example/1"], fitReason: "f" }).returning();
  return l;
}

describe.skipIf(!url)("sequences (integration)", () => {
  it("enrolls, creates step 1 due now, and schedules step 2 seven days after step 1 is done", async () => {
    if (!reachable) return;
    const l = await lead("Acme", "Jane Doe");
    const [o] = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    expect(o.ok).toBe(true);
    const done = new Date("2026-10-15T22:00:00Z"); // Oct 15 15:00 PDT
    const r = await tasks.completeTask({ taskId: o.taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 10, now: done });
    expect(r.ok && r.next).toBe("scheduled");
    expect(r.ok && r.nextDueAt && localDateKey(r.nextDueAt, TZ)).toBe("2026-10-22");
    const { upcoming } = await tasks.listTasks(userId, wsId, TZ, done);
    expect(upcoming.map((t) => t.task.channel)).toContain("email");
  });

  it("uses a custom wait when the step is edited", async () => {
    if (!reachable) return;
    const seq = await seqs.getSequence(wsId, seqId);
    await seqs.updateStep(wsId, seq!.steps[1].id, { waitDays: 3 });
    const l = await lead("Globex", "Sam Lee");
    const [o] = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    const done = new Date("2026-10-15T22:00:00Z");
    const r = await tasks.completeTask({ taskId: o.taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 10, now: done });
    expect(r.ok && r.nextDueAt && localDateKey(r.nextDueAt, TZ)).toBe("2026-10-18");
    await seqs.updateStep(wsId, seq!.steps[1].id, { waitDays: 7 });
  });

  it("enforces the per-company contact cap and refuses leads without a person", async () => {
    if (!reachable) return;
    const a = await lead("Initech", "Ann One");
    const b = await lead("Initech", "Bob Two");
    const c = await lead("Initech", "Cat Three");
    const n = await lead("Initech", null);
    const out = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [a.id, b.id, c.id, n.id] });
    expect(out.map((o) => o.ok)).toEqual([true, true, false, false]);
    expect(out[2].reason).toMatch(/cap 2/);
    expect(out[3].reason).toMatch(/contact name/);
    const again = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [a.id] });
    expect(again[0].reason).toMatch(/already enrolled/);
  });

  it("stops on a logged reply and on opt-out, cancelling open tasks", async () => {
    if (!reachable) return;
    const { db, schema } = dbmod;
    const l = await lead("Umbrella", "Rae Reply");
    const [o] = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    await db.insert(schema.leadReplies).values({ leadId: l.id, workspaceId: wsId, enrollmentId: null, channel: "email", replyText: "interested", outcome: "positive", loggedBy: userId });
    const r = await tasks.completeTask({ taskId: o.taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 10 });
    expect(r.ok && r.next).toBe("stopped");
    const [e] = await db.select().from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.leadId, l.id));
    expect(e.status).toBe("stopped");
    expect(e.stopReason).toBe("replied");
    const open = await db.select().from(schema.tasks).where(eq(schema.tasks.enrollmentId, e.id));
    expect(open.every((t) => t.status === "cancelled")).toBe(true);

    const l2 = await lead("Wayne", "Ove Out");
    const [o2] = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l2.id] });
    const n = await tasks.stopEnrollmentsForLead(l2.id, "opted_out");
    expect(n).toBe(1);
    const [t2] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, o2.taskId!));
    expect(t2.status).toBe("cancelled");
  });

  it("enforces the daily send cap", async () => {
    if (!reachable) return;
    // a day no other test completes tasks on, so the count starts at 0
    const now = new Date("2030-06-03T17:00:00Z");
    const leads = await Promise.all([lead("Cap1", "P One"), lead("Cap2", "P Two"), lead("Cap3", "P Three")]);
    const out = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: leads.map((l) => l.id) });
    const r1 = await tasks.completeTask({ taskId: out[0].taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 2, now });
    const r2 = await tasks.completeTask({ taskId: out[1].taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 2, now });
    const r3 = await tasks.completeTask({ taskId: out[2].taskId!, userId, workspaceId: wsId, timeZone: TZ, dailySendCap: 2, now });
    expect(r1.ok && r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(!r3.ok && r3.reason).toMatch(/daily send cap/);
  });
});
