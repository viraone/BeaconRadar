import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { connection } from "next/server";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { Card } from "@/components/ui";

export default async function SettingsPage() {
  await connection();
  const ctx = await requireWorkspace("/settings");
  const balance = await getCreditBalance(ctx.workspace.id);
  const ledger = await db
    .select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.workspaceId, ctx.workspace.id))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(20);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-medium">Workspace</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{ctx.workspace.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Plan</dt><dd>{ctx.workspace.plan}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Your role</dt><dd>{ctx.role}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Daily send cap</dt><dd>{ctx.workspace.dailySendCap}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contacts per company</dt><dd>{ctx.workspace.maxContactsPerCompany}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">Sender details and the suppression list arrive in Phase 6.</p>
        </Card>
        <Card>
          <h2 className="font-medium">Credits</h2>
          <p className="mt-2 text-3xl font-semibold">{balance}</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {ledger.map((row) => (
              <li key={row.id} className="flex justify-between py-1.5">
                <span className="text-muted">{row.reason}</span>
                <span className={row.delta < 0 ? "text-red-600" : "text-green-700"}>{row.delta > 0 ? `+${row.delta}` : row.delta}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
