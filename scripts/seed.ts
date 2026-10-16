/**
 * Seed a demo workspace so the app can be explored with no API keys.
 *
 *   npm run seed                      -> demo@beaconradar.example
 *   npm run seed -- you@example.com   -> seed into a workspace for that sign-in email
 *
 * Re-runnable: the demo workspace is deleted and recreated each time. Sign in with
 * the email through the normal magic link (local inbox: http://127.0.0.1:55324).
 * Everything seeded is labeled: companies "(MOCK)", emails on .example, drafts by "seed".
 */
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CREDIT_COSTS, PLANS } from "@/config/credits";
import { DEFAULT_SEQUENCE } from "@/config/outreach";
import { db, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import { appendFooter } from "@/lib/outreach/footer";
import { MOCK_BOARDS } from "@/lib/research/ats/mock";
import { nextDueAt } from "@/lib/sequences/timing";

const DEMO_EMAIL = (process.argv[2] ?? "demo@beaconradar.example").toLowerCase();
const WORKSPACE_NAME = "Demo: TapAndLaunch";

/** Supabase Auth admin API over plain HTTP (supabase-js's realtime module needs a WebSocket on Node 20). */
async function ensureAuthUser(email: string): Promise<string> {
  const e = env();
  const headers = { apikey: e.SUPABASE_SECRET_KEY, authorization: `Bearer ${e.SUPABASE_SECRET_KEY}`, "content-type": "application/json" };
  const base = `${e.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
  const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ email, email_confirm: true }) });
  if (created.ok) return ((await created.json()) as { id: string }).id;
  const listed = await fetch(`${base}?page=1&per_page=1000`, { headers });
  if (!listed.ok) throw new Error(`Auth admin API ${listed.status}: ${await listed.text()}`);
  const { users } = (await listed.json()) as { users: Array<{ id: string; email?: string }> };
  const found = users.find((u) => u.email?.toLowerCase() === email);
  if (!found) throw new Error(`Could not create or find auth user ${email}: ${created.status} ${await created.text()}`);
  return found.id;
}

async function main() {
  const userId = await ensureAuthUser(DEMO_EMAIL);
  await db.insert(schema.users).values({ id: userId, email: DEMO_EMAIL, name: "Demo Founder" }).onConflictDoUpdate({ target: schema.users.id, set: { email: DEMO_EMAIL } });

  // start clean
  const old = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.workspaces.name, WORKSPACE_NAME), eq(schema.workspaceMembers.userId, userId)));
  for (const w of old) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, w.id));

  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: WORKSPACE_NAME, plan: "free", senderName: "Demo Founder", senderCompany: "TapAndLaunch", senderPostalAddress: "123 Pine St, Seattle, WA 98101" })
    .returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });
  const ledger: Array<typeof schema.creditLedger.$inferInsert> = [
    { workspaceId: ws.id, delta: PLANS.free.signupGrant, action: "grant", reason: "Signup grant", idempotencyKey: `grant:signup:${ws.id}` },
  ];

  // profile from the fixture (a real DeepSeek analysis of tapandlaunch.com, saved so no key is needed)
  const fx = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/fixtures/tapandlaunch-profile.json"), "utf8"));
  const [profile] = await db
    .insert(schema.companyProfiles)
    .values({ workspaceId: ws.id, siteUrl: fx.siteUrl, domain: fx.domain, companyName: fx.companyName, summary: fx.summary, offering: fx.offering, icp: fx.icp, sourceUrls: fx.sourceUrls, status: "ready", analysisModel: "seed", analyzedAt: new Date() })
    .returning();

  // plays: one completed hiring play with mock leads, two "coming soon" drafts
  const rowLimit = PLANS.free.rowsPerTable;
  const [hiring] = await db
    .insert(schema.plays)
    .values({
      workspaceId: ws.id, companyProfileId: profile.id, type: "hiring_signal", title: "Businesses hiring a marketing or community manager",
      rationale: "Your buying signals mention hiring a marketing or community manager; an open posting is a public sign of that need.",
      params: { roles: ["Marketing Manager", "Community Manager"] }, status: "completed", rowLimit, creditEstimate: rowLimit, creditsSpent: 0,
      startedAt: daysAgo(3), finishedAt: daysAgo(3),
    })
    .returning();
  await db.insert(schema.plays).values([
    { workspaceId: ws.id, companyProfileId: profile.id, type: "decision_makers", title: "Owners of independent restaurants, gyms and shops", rationale: "Your buyer titles are owners and managers of local businesses.", params: { buyerTitles: ["Owner", "Founder", "Gym owner"] }, status: "draft", rowLimit, creditEstimate: rowLimit },
    { workspaceId: ws.id, companyProfileId: profile.id, type: "local_business", title: "Gyms and studios in Seattle", rationale: "Your ICP lists gyms and studios and the United States.", params: { category: "gym", city: "Seattle" }, status: "draft", rowLimit, creditEstimate: rowLimit },
  ]);

  // leads from the mock job boards (one per company), with contacts in various states
  const contacts: Array<{ person: string | null; title: string | null; email: string | null; status: typeof schema.emailStatusEnum.enumValues[number]; provider: string | null }> = [
    { person: "Sam Lee", title: "Owner", email: "slee@mockfitstudiosmock.example", status: "verified", provider: "mockB" },
    { person: "Priya Patel", title: "General Manager", email: "ppatel@mockbistrogroupmock.example", status: "unverified", provider: "mockA" },
    { person: "Omar Khan", title: "Events Director", email: null, status: "not_found", provider: null },
    { person: null, title: null, email: null, status: "unknown", provider: null },
  ];
  const leads: Array<typeof schema.leads.$inferSelect> = [];
  for (const [i, board] of MOCK_BOARDS.entries()) {
    const job = board.jobs.find((j) => /manager/i.test(j.title)) ?? board.jobs[0];
    const c = contacts[i];
    const [lead] = await db
      .insert(schema.leads)
      .values({
        playId: hiring.id, workspaceId: ws.id, company: board.companyName, companyDomain: `${board.companyName.toLowerCase().replace(/[^a-z]/g, "")}.com`,
        person: c.person, title: c.title, email: c.email, emailStatus: c.status, emailProvider: c.provider,
        sourceUrls: [job.url], fitReason: `Hiring "${job.title}" (${job.location}), posted ${job.postedAt.slice(0, 10)}. Matches role "${job.title}". Confirmed via the ${board.source} job-board API.`,
        signal: { kind: "job_posting", ats: board.source, board: board.board, title: job.title, location: job.location, postedAt: job.postedAt, url: job.url, matchedRole: job.title, matchingOpenRoles: 1, ...(c.email ? { email: { provider: c.provider, mock: true, confidence: c.status === "verified" ? 0.95 : 0.6, sourceUrl: null, checkedAt: daysAgo(2).toISOString() } } : {}) },
        createdAt: daysAgo(3), updatedAt: daysAgo(2),
      })
      .returning();
    leads.push(lead);
    ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.search_result, action: "search_result", reason: `Lead found: ${lead.company}`, refType: "lead", refId: lead.id, idempotencyKey: `lead:${lead.id}:search_result`, createdAt: daysAgo(3) });
    if (c.email) ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.enrich_found, action: "enrich_found", reason: `Email found: ${lead.company}`, refType: "lead", refId: lead.id, idempotencyKey: `lead:${lead.id}:enrich_found`, createdAt: daysAgo(2) });
    if (c.status === "verified") ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.verify, action: "verify", reason: `Email verified: ${lead.company}`, refType: "lead", refId: lead.id, idempotencyKey: `lead:${lead.id}:verify`, createdAt: daysAgo(2) });
  }
  await db.update(schema.plays).set({ creditsSpent: leads.length }).where(eq(schema.plays.id, hiring.id));

  // default sequence
  const [seq] = await db.insert(schema.sequences).values({ workspaceId: ws.id, name: DEFAULT_SEQUENCE.name, isDefault: true }).returning();
  const steps = await db.insert(schema.sequenceSteps).values(DEFAULT_SEQUENCE.steps.map((s) => ({ sequenceId: seq.id, position: s.position, channel: s.channel, waitDays: s.waitDays, intent: s.intent }))).returning();
  const sender = ws;

  // lead 1: step 1 sent 2 days ago, step 2 (email) due in 5 days with a draft ready
  {
    const lead = leads[0];
    const sentAt = daysAgo(2);
    const due = nextDueAt(sentAt, steps[1].waitDays, ws.timezone);
    const [enr] = await db.insert(schema.sequenceEnrollments).values({ sequenceId: seq.id, leadId: lead.id, workspaceId: ws.id, ownerUserId: userId, status: "active", currentPosition: 2, nextDueAt: due, createdAt: sentAt }).returning();
    const [t1] = await db.insert(schema.tasks).values({ enrollmentId: enr.id, stepId: steps[0].id, leadId: lead.id, workspaceId: ws.id, ownerUserId: userId, channel: "linkedin_connect", dueAt: sentAt, status: "done", completedAt: sentAt, createdAt: sentAt }).returning();
    const [t2] = await db.insert(schema.tasks).values({ enrollmentId: enr.id, stepId: steps[1].id, leadId: lead.id, workspaceId: ws.id, ownerUserId: userId, channel: "email", dueAt: due, status: "pending", createdAt: sentAt }).returning();
    const d1 = await db.insert(schema.outreachDrafts).values({
      leadId: lead.id, workspaceId: ws.id, taskId: t1.id, channel: "linkedin_connect", subject: null,
      body: "Hi Sam, saw MockFit Studios is hiring a Community Manager in Portland. That role often arrives before there's anywhere for members to gather between visits. Curious whether keeping members engaged outside the studio is on your list.",
      beliefStage: "problem_awareness", status: "sent_manually", model: "seed", createdAt: sentAt,
    }).returning();
    const d2 = await db.insert(schema.outreachDrafts).values({
      leadId: lead.id, workspaceId: ws.id, taskId: t2.id, channel: "email", subject: "Where the Community Manager would publish",
      body: appendFooter("Hi Sam,\n\nOne more angle on the Community Manager hire: whoever takes that role needs somewhere to post schedules, member-only content and payments that doesn't wait on a developer or an app store review.\n\nTapAndLaunch is a no-code builder that turns a studio into a web app members install from a link or QR code.\n\nWould it help if that role had its own channel instead of relying on social posts and group texts?", sender),
      beliefStage: "problem_prioritization", newValue: { type: "angle", detail: "the hire needs an owned publishing channel that doesn't depend on a developer or app store approval" },
      status: "draft", model: "seed", createdAt: sentAt,
    }).returning();
    for (const d of [...d1, ...d2]) ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.draft, action: "draft", reason: `Draft written: ${lead.company}`, refType: "draft", refId: d.id, idempotencyKey: `draft:${d.id}:draft`, createdAt: sentAt });
  }

  // lead 2: enrolled today, step 1 due now with a draft
  {
    const lead = leads[1];
    const now = new Date();
    const [enr] = await db.insert(schema.sequenceEnrollments).values({ sequenceId: seq.id, leadId: lead.id, workspaceId: ws.id, ownerUserId: userId, status: "active", currentPosition: 1, nextDueAt: now }).returning();
    const [t1] = await db.insert(schema.tasks).values({ enrollmentId: enr.id, stepId: steps[0].id, leadId: lead.id, workspaceId: ws.id, ownerUserId: userId, channel: "linkedin_connect", dueAt: now, status: "pending" }).returning();
    const [d] = await db.insert(schema.outreachDrafts).values({
      leadId: lead.id, workspaceId: ws.id, taskId: t1.id, channel: "linkedin_connect", subject: null,
      body: "Hi Priya, saw Mock Bistro Group is hiring a Marketing Manager in Seattle. Restaurants adding that role usually want regulars to hear about specials without fighting the algorithm. Happy to connect.",
      beliefStage: "problem_awareness", status: "draft", model: "seed",
    }).returning();
    ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.draft, action: "draft", reason: `Draft written: ${lead.company}`, refType: "draft", refId: d.id, idempotencyKey: `draft:${d.id}:draft` });
  }

  // lead 3: a positive LinkedIn reply with a timing objection (no sequence), stage moved up
  {
    const lead = leads[2];
    await db.insert(schema.leadReplies).values({ leadId: lead.id, workspaceId: ws.id, enrollmentId: null, channel: "linkedin_message", replyText: "Interesting. We're mid-hire for that role, can you ping me next month?", objectionType: "timing", outcome: "positive", loggedBy: userId, createdAt: daysAgo(1) });
    await db.update(schema.leads).set({ beliefStage: "problem_prioritization" }).where(eq(schema.leads.id, lead.id));
    const [d] = await db.insert(schema.outreachDrafts).values({
      leadId: lead.id, workspaceId: ws.id, channel: "linkedin_message", subject: null,
      body: "Hi Omar, saw Mock Venue Co is hiring an Events Marketing Manager. Venues adding that role usually run into the same thing: ticket buyers vanish after the event. Is getting them back for the next one something you're working on?",
      beliefStage: "problem_awareness", status: "sent_manually", model: "seed", createdAt: daysAgo(2),
    }).returning();
    ledger.push({ workspaceId: ws.id, delta: -CREDIT_COSTS.draft, action: "draft", reason: `Draft written: ${lead.company}`, refType: "draft", refId: d.id, idempotencyKey: `draft:${d.id}:draft`, createdAt: daysAgo(2) });
  }

  await db.insert(schema.suppressionList).values({ workspaceId: ws.id, email: null, domain: "competitor.example", reason: "Competitor" });
  await db.insert(schema.creditLedger).values(ledger);

  const balance = ledger.reduce((s, r) => s + r.delta, 0);
  console.log(`Seeded "${WORKSPACE_NAME}" for ${DEMO_EMAIL}`);
  console.log(`  workspace ${ws.id} · ${leads.length} leads · 3 plays · 1 sequence · ${balance} credits left`);
  console.log(`Sign in at http://localhost:3000/login (or your dev port) with ${DEMO_EMAIL}; the link lands in http://127.0.0.1:55324`);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

main().then(() => process.exit(0)).catch((e) => { console.error("Seed failed:", e); process.exit(1); });
