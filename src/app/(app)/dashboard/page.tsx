import { connection } from "next/server";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { loadMetrics, type Breakdown } from "@/lib/replies/metrics";
import { Card } from "@/components/ui";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const ctx = await requireWorkspace("/dashboard");
  const m = await loadMetrics(ctx.workspace.id);
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning loop</h1>
        <p className="mt-1 text-sm text-muted">
          Judge by replies, not opens. Run {m.target.min} to {m.target.max} qualified prospects through a sequence, then look at what converted and why.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prospects contacted" value={m.contacted} hint="people with at least one step sent" />
        <Stat label="Replies" value={m.replies} hint={`${pct(m.replyRate)} of contacted`} />
        <Stat label="Positive replies" value={m.positive} hint={`${pct(m.positiveRate)} of contacted`} />
        <Stat label="Meetings booked" value={m.meetings} hint={m.awaitingOutcome ? `${m.awaitingOutcome} finished sequences with no reply logged` : "log replies as they come in"} />
      </div>

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progress to the first review</span>
          <span className="text-muted">{m.contacted} of {m.target.min} contacted{m.contacted >= m.target.min ? " · time to review what converted" : ""}</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" role="meter" aria-valuemin={0} aria-valuemax={m.target.min} aria-valuenow={Math.min(m.contacted, m.target.min)} aria-label="Prospects contacted toward the review target">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(m.target.progress * 100)}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By play type" rows={m.byPlayType} />
        <BreakdownTable title="By channel" rows={m.byChannel} />
        <BreakdownTable title="By step when they replied" rows={m.byStep} />
        <BreakdownTable title="By belief stage reached" rows={m.byStage} hideContacted />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CountTable title="Objections heard" rows={m.objections} empty="No objections logged yet." />
        <CountTable title="Reply outcomes" rows={m.outcomes} empty="No replies logged yet." />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">Recent replies</h2>
          <p className="text-xs text-muted">Log replies from the Tasks page, a play&apos;s leads table, or a draft card.</p>
        </div>
        {m.recent.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {m.recent.map((r) => (
              <li key={r.id} className="px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{r.person ?? "no contact"}</span> · {r.company} · {r.channel.replace("_", " ")}</span>
                  <span className="text-muted">{r.outcome.replace("_", " ")}{r.objectionType ? ` · ${r.objectionType.replace("_", " ")}` : ""} · {r.createdAt.toLocaleDateString()}</span>
                </div>
                {r.replyText && <p className="mt-1 line-clamp-2 text-muted">{r.replyText}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted">
        There is no open-rate metric and no tracking pixel, on purpose. See <Link href="/sequences" className="underline">Sequences</Link> for the rules in force.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-4xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </Card>
  );
}

function BreakdownTable({ title, rows, hideContacted = false }: { title: string; rows: Breakdown; hideContacted?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => (hideContacted ? r.replies : r.contacted)));
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3"><h2 className="font-medium">{title}</h2></div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">{title.replace(/^By /, "")}</th>
              {!hideContacted && <th className="px-2 py-2 text-right">Contacted</th>}
              <th className="px-2 py-2 text-right">Replies</th>
              <th className="px-2 py-2 text-right">Positive</th>
              <th className="w-1/3 px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const v = hideContacted ? r.replies : r.contacted;
              return (
                <tr key={r.key}>
                  <td className="px-4 py-1.5">{r.key.replace(/_/g, " ")}</td>
                  {!hideContacted && <td className="px-2 py-1.5 text-right tabular-nums">{r.contacted}</td>}
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.replies}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.positive}</td>
                  <td className="px-4 py-1.5">
                    <div className="h-1.5 w-full rounded-full bg-border" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((v / max) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function CountTable({ title, rows, empty }: { title: string; rows: Array<{ key: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3"><h2 className="font-medium">{title}</h2></div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto_40%] items-center gap-3 px-4 py-1.5">
              <span>{r.key.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-muted">{r.count}</span>
              <div className="h-1.5 w-full rounded-full bg-border" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
