import { connection } from "next/server";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { canExport } from "@/lib/export/leads";
import { senderIsComplete } from "@/lib/outreach/footer";
import { Notice } from "@/components/ui";
import { AutoRefresh } from "@/app/(app)/profile/[id]/auto-refresh";
import { DraftCard } from "./draft-card";

export const instant = false;

export default async function DraftsPage() {
  await connection();
  const ctx = await requireWorkspace("/drafts");
  const rows = await db
    .select({ draft: schema.outreachDrafts, lead: schema.leads })
    .from(schema.outreachDrafts)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.outreachDrafts.leadId))
    .where(eq(schema.outreachDrafts.workspaceId, ctx.workspace.id))
    .orderBy(desc(schema.outreachDrafts.createdAt))
    .limit(200);
  const [pendingJobs] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.type, "draft_outreach"))
    .limit(50);
  const anyRunning = (await db.select({ status: schema.jobs.status }).from(schema.jobs).where(eq(schema.jobs.type, "draft_outreach"))).some((j) => j.status === "queued" || j.status === "running");
  void pendingJobs;

  const groups = {
    review: rows.filter((r) => r.draft.status === "draft"),
    blocked: rows.filter((r) => r.draft.status === "blocked"),
    approved: rows.filter((r) => r.draft.status === "approved" || r.draft.status === "sent_manually"),
    discarded: rows.filter((r) => r.draft.status === "discarded"),
  };

  return (
    <div className="space-y-6">
      {anyRunning && <AutoRefresh intervalMs={3000} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
          <p className="mt-1 text-sm text-muted">
            Every message is reviewed here before anything leaves. Nothing is sent by Origami: approve, then copy or open in your mail app.
          </p>
        </div>
        <div className="text-sm">
          {canExport(ctx.workspace.plan) ? (
            <a href="/drafts/export" className="rounded-md border border-border bg-card px-4 py-2 hover:bg-background">Export approved as CSV</a>
          ) : (
            <span className="rounded-md border border-border px-4 py-2 text-muted" title="Export is a paid-plan feature">Export CSV · Pro plan</span>
          )}
        </div>
      </div>

      {!senderIsComplete(ctx.workspace) && (
        <Notice kind="error">
          Fill in your sender details on the <Link className="underline" href="/settings">Settings</Link> page before drafting. The CAN-SPAM footer needs your name, company and postal address.
        </Notice>
      )}
      {anyRunning && <Notice>Writing drafts… this page refreshes itself.</Notice>}
      {rows.length === 0 && !anyRunning && (
        <p className="text-sm text-muted">
          No drafts yet. Open a play&apos;s leads, select leads with a contact name, and click <strong>Draft email</strong>.
        </p>
      )}

      {groups.blocked.length > 0 && (
        <Section title={`Blocked (${groups.blocked.length})`} hint="Failed a check. Edit the text or regenerate.">
          {groups.blocked.map((r) => <DraftCard key={r.draft.id} draft={toView(r)} />)}
        </Section>
      )}
      {groups.review.length > 0 && (
        <Section title={`To review (${groups.review.length})`} hint="Passed every check. Approve to mark it ready, then copy or open in your mail app.">
          {groups.review.map((r) => <DraftCard key={r.draft.id} draft={toView(r)} />)}
        </Section>
      )}
      {groups.approved.length > 0 && (
        <Section title={`Approved (${groups.approved.length})`} hint="Ready to send by hand. Mark as sent once you have.">
          {groups.approved.map((r) => <DraftCard key={r.draft.id} draft={toView(r)} />)}
        </Section>
      )}
      {groups.discarded.length > 0 && (
        <Section title={`Discarded (${groups.discarded.length})`}>
          {groups.discarded.slice(0, 10).map((r) => <DraftCard key={r.draft.id} draft={toView(r)} />)}
        </Section>
      )}
    </div>
  );
}

function toView(r: { draft: typeof schema.outreachDrafts.$inferSelect; lead: typeof schema.leads.$inferSelect }) {
  return {
    id: r.draft.id,
    channel: r.draft.channel,
    subject: r.draft.subject,
    body: r.draft.body,
    beliefStage: r.draft.beliefStage,
    newValue: r.draft.newValue,
    status: r.draft.status,
    blockReasons: r.draft.blockReasons,
    model: r.draft.model,
    createdAt: r.draft.createdAt.toLocaleString(),
    lead: { id: r.lead.id, playId: r.lead.playId, company: r.lead.company, person: r.lead.person, title: r.lead.title, email: r.lead.email, emailStatus: r.lead.emailStatus, sourceUrls: r.lead.sourceUrls },
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}
