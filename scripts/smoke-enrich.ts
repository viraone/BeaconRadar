/** Dev-only: add a contact to a lead and run the enrichment waterfall with the configured providers. */
import { eq } from "drizzle-orm";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { enrichLeads } from "@/lib/enrichment/runner";

async function main() {
  const playId = process.argv[2]!;
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.playId, playId));
  if (!leads.length) throw new Error("no leads");
  const ws = leads[0].workspaceId;
  console.log("balance before:", await getBalance(ws));
  // try a few contact names until the waterfall finds something (mock outcomes are hash-based)
  const names = ["Jane Doe", "Sam Lee", "Priya Patel", "Omar Khan", "Mia Chen", "Leo Park", "Ava Ruiz", "Noah Kim"];
  let summary;
  for (const name of names) {
    for (const l of leads) {
      await db.update(schema.leads).set({ person: name, title: "Owner", companyDomain: `${l.company.toLowerCase().replace(/[^a-z]/g, "")}.com`, email: null, emailStatus: "unknown", emailProvider: null }).where(eq(schema.leads.id, l.id));
    }
    summary = await enrichLeads(ws, leads.map((l) => l.id));
    console.log(`${name}: ${JSON.stringify(summary)}`);
    if (summary.found > 0) break;
  }
  const again = await enrichLeads(ws, leads.map((l) => l.id));
  console.log("re-run (idempotent, expect same result, no new charges):", JSON.stringify(again));
  const after = await db.select({ company: schema.leads.company, person: schema.leads.person, email: schema.leads.email, status: schema.leads.emailStatus, provider: schema.leads.emailProvider }).from(schema.leads).where(eq(schema.leads.playId, playId));
  console.log(JSON.stringify(after, null, 2));
  const ledger = await db.select({ action: schema.creditLedger.action, delta: schema.creditLedger.delta, reason: schema.creditLedger.reason }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ws));
  console.log("ledger:", JSON.stringify(ledger.filter((r) => r.action !== "grant")));
  console.log("balance after:", await getBalance(ws));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
