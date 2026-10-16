import { connection } from "next/server";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { CREDIT_COSTS, PLANS } from "@/config/credits";
import { db, schema } from "@/lib/db/client";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { Card } from "@/components/ui";
import { SenderForm } from "./sender-form";
import { SuppressionForm } from "./suppression-form";
import { senderIsComplete } from "@/lib/outreach/footer";
import { fetchProviderBalance, loadUsageSummary } from "@/lib/llm/usage";
import { env } from "@/lib/env";

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
  const suppression = await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.workspaceId, ctx.workspace.id)).orderBy(desc(schema.suppressionList.createdAt));
  const [usage, providerBalance] = await Promise.all([loadUsageSummary(ctx.workspace.id, 30), fetchProviderBalance()]);
  const llmProvider = env().LLM_PROVIDER;
  const usd = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);
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
          <p className="mt-3 text-xs text-muted">Billing isn&apos;t built yet; plans are set by hand.</p>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-medium">Sender details</h2>
          <p className="mt-1 text-sm text-muted">
            Goes in the footer of every email draft with the opt-out line.{" "}
            {senderIsComplete(ctx.workspace) ? "" : "Drafting is blocked until this is filled in."}
          </p>
          <div className="mt-3">
            <SenderForm
              canEdit={ctx.role === "owner"}
              initial={{
                senderName: ctx.workspace.senderName ?? "",
                senderCompany: ctx.workspace.senderCompany ?? "",
                senderPostalAddress: ctx.workspace.senderPostalAddress ?? "",
                dailySendCap: ctx.workspace.dailySendCap,
                maxContactsPerCompany: ctx.workspace.maxContactsPerCompany,
              }}
            />
          </div>
        </Card>
        <Card>
          <h2 className="font-medium">Suppression list</h2>
          <p className="mt-1 text-sm text-muted">Emails and domains we never draft to or export. Opt-outs land here automatically.</p>
          <div className="mt-3">
            <SuppressionForm rows={suppression.map((r) => ({ id: r.id, email: r.email, domain: r.domain, reason: r.reason, createdAt: r.createdAt.toLocaleDateString() }))} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">Model spend</h2>
            <p className="mt-1 text-sm text-muted">
              Provider: <strong>{llmProvider}</strong>. Last 30 days for this workspace. Costs are upper-bound estimates from list prices; the provider&apos;s dashboard is the bill.
            </p>
          </div>
          {providerBalance ? (
            <div className="text-right text-sm">
              <div className="text-xs uppercase tracking-wide text-muted">DeepSeek balance (live)</div>
              <div className="text-2xl font-semibold tabular-nums">${providerBalance.total.toFixed(2)} <span className="text-sm font-normal text-muted">{providerBalance.currency}</span></div>
              {!providerBalance.available && <div className="text-xs text-red-700 dark:text-red-300">Balance too low for API calls</div>}
            </div>
          ) : (
            llmProvider === "deepseek" && <div className="text-xs text-muted">Live balance unavailable</div>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><div className="text-xs uppercase tracking-wide text-muted">Calls</div><div className="text-2xl font-semibold tabular-nums">{usage.calls}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted">Tokens</div><div className="text-2xl font-semibold tabular-nums">{(usage.inputTokens + usage.outputTokens).toLocaleString()}</div><div className="text-xs text-muted">{usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted">Estimated cost</div><div className="text-2xl font-semibold tabular-nums">{usd(usage.estimatedCostUsd)}</div></div>
        </div>
        {usage.byTask.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1">Task</th><th className="py-1 text-right">Calls</th><th className="py-1 text-right">Tokens</th><th className="py-1 text-right">Est. cost</th></tr></thead>
            <tbody className="divide-y divide-border">
              {usage.byTask.map((t) => (
                <tr key={t.task}><td className="py-1">{t.task.replace(/_/g, " ")}</td><td className="py-1 text-right tabular-nums">{t.calls}</td><td className="py-1 text-right tabular-nums">{t.tokens.toLocaleString()}</td><td className="py-1 text-right tabular-nums">{usd(t.estimatedCostUsd)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {usage.calls === 0 && <p className="mt-3 text-sm text-muted">No model calls recorded for this workspace yet. Calls made before spend tracking was added aren&apos;t counted.</p>}
      </Card>

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
