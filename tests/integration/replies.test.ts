import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL;
let reachable = false;
let dbmod: typeof import("@/lib/db/client");
let log: typeof import("@/lib/replies/log");
let enroll: typeof import("@/lib/sequences/enroll");
let seqs: typeof import("@/lib/sequences/sequences");
let metrics: typeof import("@/lib/replies/metrics");
let wsId: string, userId: string, playId: string, seqId: string;

beforeAll(async () => {
  if (!url) return;
  try {
    dbmod = await import("@/lib/db/client");
    await dbmod.db.execute("select 1");
    reachable = true;
    log = await import("@/lib/replies/log");
    enroll = await import("@/lib/sequences/enroll");
    seqs = await import("@/lib/sequences/sequences");
    metrics = await import("@/lib/replies/metrics");
    const { db, schema } = dbmod;
    userId = crypto.randomUUID();
    await db.insert(schema.users).values({ id: userId, email: `rep-${userId}@example.com` });
    const [ws] = await db.insert(schema.workspaces).values({ name: "replies-test" }).returning();
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

async function lead(company: string, person: string, email: string | null) {
  const [l] = await dbmod.db.insert(dbmod.schema.leads).values({ playId, workspaceId: wsId, company, companyDomain: `${company.toLowerCase()}.com`, person, email, emailStatus: email ? "verified" : "unknown", sourceUrls: ["https://src.example/1"], fitReason: "f" }).returning();
  return l;
}

describe.skipIf(!url)("reply logging (integration)", () => {
  it("a positive reply stops the sequence, cancels tasks and moves the stage up", async () => {
    if (!reachable) return;
    const { db, schema } = dbmod;
    const l = await lead("Acme", "Jane Doe", "jane@acme.example");
    const [o] = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    const r = await log.logReply({ workspaceId: wsId, leadId: l.id, loggedBy: userId, channel: "linkedin_connect", outcome: "positive", replyText: "sure, tell me more" });
    expect(r.stoppedEnrollments).toBe(1);
    expect(r.beliefStage).toBe("problem_prioritization");
    const [t] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, o.taskId!));
    expect(t.status).toBe("cancelled");
    const [e] = await db.select().from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.leadId, l.id));
    expect(e.stopReason).toBe("replied");
  });

  it("an opt-out suppresses the email and marks the lead suppressed", async () => {
    if (!reachable) return;
    const { db, schema } = dbmod;
    const l = await lead("Globex", "Sam Lee", "Sam@Globex.example");
    await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    const r = await log.logReply({ workspaceId: wsId, leadId: l.id, loggedBy: userId, channel: "email", outcome: "opt_out" });
    expect(r.suppressed).toBe(true);
    const sup = await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.workspaceId, wsId));
    expect(sup.map((s) => s.email)).toContain("sam@globex.example");
    const [after] = await db.select().from(schema.leads).where(eq(schema.leads.id, l.id));
    expect(after.emailStatus).toBe("suppressed");
    const [e] = await db.select().from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.leadId, l.id));
    expect(e.stopReason).toBe("opted_out");
    // re-enrolling is refused because the lead is suppressed
    const again = await enroll.enrollLeads({ workspaceId: wsId, userId, sequenceId: seqId, leadIds: [l.id] });
    expect(again[0].reason).toMatch(/suppression/);
  });

  it("a bounce clears the email; the user can set the stage explicitly; metrics reflect it all", async () => {
    if (!reachable) return;
    const { db, schema } = dbmod;
    const l = await lead("Initech", "Ann One", "ann@initech.example");
    await log.logReply({ workspaceId: wsId, leadId: l.id, loggedBy: userId, channel: "email", outcome: "bounced" });
    const [after] = await db.select().from(schema.leads).where(eq(schema.leads.id, l.id));
    expect(after.email).toBeNull();
    expect(after.emailStatus).toBe("not_found");

    const l2 = await lead("Wayne", "Bo Two", null);
    const r = await log.logReply({ workspaceId: wsId, leadId: l2.id, loggedBy: userId, channel: "email", outcome: "meeting_booked", beliefStage: "commercial_agreement" });
    expect(r.beliefStage).toBe("commercial_agreement");

    const m = await metrics.loadMetrics(wsId);
    expect(m.replies).toBe(4);
    expect(m.meetings).toBe(1);
    expect(m.outcomes.find((o) => o.key === "opt_out")?.count).toBe(1);
    expect(m.recent.length).toBe(4);
  });
});
