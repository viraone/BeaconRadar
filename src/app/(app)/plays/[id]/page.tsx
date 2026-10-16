import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CREDIT_COSTS, PLANS } from "@/config/credits";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { canExport } from "@/lib/export/leads";
import { isSuppressed, loadSuppression } from "@/lib/outreach/suppression";
import { PLAYS } from "@/lib/plays/registry";
import { Notice } from "@/components/ui";
import { AutoRefresh } from "@/app/(app)/profile/[id]/auto-refresh";
import { LeadsTable } from "./leads-table";

export const instant = false;

export default async function PlayLeadsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ctx = await requireWorkspace(`/plays/${id}`);
  const [play] = await db.select().from(schema.plays).where(and(eq(schema.plays.id, id), eq(schema.plays.workspaceId, ctx.workspace.id))).limit(1);
  if (!play) notFound();
  const [leads, suppression, balance] = await Promise.all([
    db.select().from(schema.leads).where(eq(schema.leads.playId, id)).orderBy(asc(schema.leads.createdAt)),
    loadSuppression(ctx.workspace.id),
    getCreditBalance(ctx.workspace.id),
  ]);
  const running = play.status === "queued" || play.status === "running";
  const isMock = leads.some((l) => l.sourceUrls.some((u) => u.startsWith("mock://")) || /\(MOCK\)/.test(l.company));
  const plan = PLANS[ctx.workspace.plan];
  const exportAllowed = canExport(ctx.workspace.plan);
  const suppressedCount = leads.filter((l) => isSuppressed({ email: l.email, companyDomain: l.companyDomain }, suppression)).length;
  const atCap = leads.length >= Math.min(play.rowLimit, plan.rowsPerTable);

  return (
    <div className="space-y-6">
      {running && <AutoRefresh intervalMs={3000} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/plays" className="text-sm text-muted hover:text-foreground">← All plays</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{play.title}</h1>
          <p className="text-sm text-muted">
            {PLAYS[play.type].label} · {play.status} · {leads.length} of {Math.min(play.rowLimit, plan.rowsPerTable)} rows · {play.creditsSpent} credits spent
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {exportAllowed ? (
            <a href={`/plays/${play.id}/export`} className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90">
              Export CSV
            </a>
          ) : (
            <span className="rounded-md border border-border px-4 py-2 text-muted" title="CSV export is a paid-plan feature">
              Export CSV · Pro plan
            </span>
          )}
        </div>
      </div>

      {running && <Notice>Searching job boards and confirming postings through the official APIs… this page refreshes itself.</Notice>}
      {play.error && <Notice kind={play.status === "failed" ? "error" : "info"}>{play.error}</Notice>}
      {isMock && <Notice>These are <strong>mock leads</strong> from fixture job boards. Set SEARCH_PROVIDER=tavily or brave with a key in .env.local for real results.</Notice>}
      {!exportAllowed && leads.length > 0 && (
        <Notice>
          Free plan: tables hold up to {plan.rowsPerTable} rows and CSV export is off. Copy from the table for now; billing isn&apos;t built yet.
        </Notice>
      )}
      {atCap && !running && <Notice>This table reached its {Math.min(play.rowLimit, plan.rowsPerTable)}-row cap for your plan.</Notice>}
      {suppressedCount > 0 && <Notice>{suppressedCount} lead{suppressedCount === 1 ? " is" : "s are"} on your suppression list and will be left out of drafts and exports.</Notice>}

      {leads.length === 0 && !running ? (
        <p className="text-sm text-muted">No leads found for this play.</p>
      ) : (
        <LeadsTable
          playId={play.id}
          balance={balance}
          perEmailCost={CREDIT_COSTS.enrich_found + CREDIT_COSTS.verify}
          leads={leads.map((l) => ({
            id: l.id,
            company: l.company,
            companyDomain: l.companyDomain,
            person: l.person,
            title: l.title,
            email: l.email,
            emailStatus: l.emailStatus,
            emailProvider: l.emailProvider,
            emailIsMock: Boolean((l.signal as { email?: { mock?: boolean } } | null)?.email?.mock),
            fitReason: l.fitReason,
            sourceUrls: l.sourceUrls,
            suppressed: isSuppressed({ email: l.email, companyDomain: l.companyDomain }, suppression),
          }))}
        />
      )}
      <p className="text-xs text-muted">
        &quot;not found&quot; means exactly that: nothing is guessed. Add a contact you know, then Enrich to look up a work email through the provider waterfall. Emails marked <em>mock</em> come from stub providers and end in .example.
      </p>
    </div>
  );
}
