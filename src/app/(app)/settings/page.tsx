import { connection } from "next/server";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { CREDIT_COSTS, PLANS } from "@/config/credits";
import { db, schema } from "@/lib/db/client";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { Card } from "@/components/ui";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const ctx = await requireWorkspace("/settings");
  const [balance, ledger, totals, playTitles] = await Promise.all([
    getCreditBalance(ctx.workspace.id),
    db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ctx.workspace.id)).orderBy(desc(schema.creditLedger.createdAt)).limit(200),
    db
      .select({
        granted: sql<number>`coalesce(sum(case when ${schema.creditLedger.delta} > 0 then ${schema.creditLedger.delta} else 0 end), 0)::int`,
        spent: sql<number>`coalesce(sum(case when ${schema.creditLedger.delta} < 0 then -${schema.creditLedger.delta} else 0 end), 0)::int`,
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.workspaceId, ctx.workspace.id)),
    db.select({ id: schema.plays.id, title: schema.plays.title }).from(schema.plays).where(eq(schema.plays.workspaceId, ctx.workspace.id)),
  ]);
  const leadPlay = new Map<string, string>();
  if (ledger.some((r) => r.refType === "lead")) {
    const rows = await db.select({ id: schema.leads.id, playId: schema.leads.playId }).from(schema.leads).where(eq(schema.leads.workspaceId, ctx.workspace.id));
    for (const r of rows) leadPlay.set(r.id, r.playId);
  }
  const titleOf = new Map(playTitles.map((p) => [p.id, p.title]));
  const plan = PLANS[ctx.workspace.plan];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-medium">Workspace</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Name" v={ctx.workspace.name} />
            <Row k="Plan" v={`${ctx.workspace.plan} · ${plan.rowsPerTable} rows/table · export ${plan.canExport ? "on" : "off"}`} />
            <Row k="Your role" v={ctx.role} />
            <Row k="Daily send cap" v={String(ctx.workspace.dailySendCap)} />
            <Row k="Contacts per company" v={String(ctx.workspace.maxContactsPerCompany)} />
          </dl>
          <p className="mt-3 text-xs text-muted">Sender details and the suppression list arrive in Phase 6. Billing isn&apos;t built yet; plans are set by hand.</p>
        </Card>
        <Card>
          <h2 className="font-medium">Credits</h2>
          <p className="mt-2 text-3xl font-semibold">{balance}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Granted" v={`+${totals[0]?.granted ?? 0}`} />
            <Row k="Spent" v={`−${totals[0]?.spent ?? 0}`} />
          </dl>
        </Card>
        <Card>
          <h2 className="font-medium">What things cost</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Lead found" v={`${CREDIT_COSTS.search_result}`} />
            <Row k="Email found" v={`${CREDIT_COSTS.enrich_found}`} />
            <Row k="Email verified" v={`${CREDIT_COSTS.verify}`} />
            <Row k="Draft written" v={`${CREDIT_COSTS.draft}`} />
          </dl>
          <p className="mt-3 text-xs text-muted">Charged only for results actually found. Estimates shown before a play runs are upper bounds.</p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">Ledger</h2>
          <p className="text-xs text-muted">Most recent 200 entries.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Play</th>
              <th className="px-4 py-2 text-right">Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ledger.map((row) => {
              const playId = row.refType === "play" ? row.refId : row.refType === "lead" && row.refId ? leadPlay.get(row.refId) : undefined;
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-1.5 text-muted">{row.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-1.5">{row.action}</td>
                  <td className="px-4 py-1.5 text-muted">{row.reason}</td>
                  <td className="px-4 py-1.5">
                    {playId ? <Link href={`/plays/${playId}`} className="underline">{titleOf.get(playId) ?? "play"}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className={`px-4 py-1.5 text-right ${row.delta < 0 ? "text-red-600 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
