/** Dev-only: set sender details, draft a first touch for a play's leads, approve it, then draft a follow-up. */
import { and, eq, inArray } from "drizzle-orm";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { mockLlm } from "@/lib/llm/llm";
import { generateDraft } from "@/lib/outreach/draft";
import { draftForLeads } from "@/lib/outreach/runner";

async function main() {
  const playId = process.argv[2]!;
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.playId, playId));
  const ws = leads[0].workspaceId;
  await db.update(schema.workspaces).set({ senderName: "Viradeth Xay-Ananh", senderCompany: "TapAndLaunch", senderPostalAddress: "123 Pine St, Seattle, WA 98101" }).where(eq(schema.workspaces.id, ws));
  console.log("balance before:", await getBalance(ws));

  console.log("== step 1 (real LLM)");
  console.log(JSON.stringify(await draftForLeads(ws, leads.map((l) => l.id), "email")));
  const show = async () => {
    const drafts = await db.select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.workspaceId, ws), inArray(schema.outreachDrafts.leadId, leads.map((l) => l.id))));
    for (const d of drafts) console.log(`\n--- ${d.status} | stage=${d.beliefStage} | model=${d.model} | blocked=${JSON.stringify(d.blockReasons)}\nSubject: ${d.subject}\n${d.body}\n`);
    return drafts;
  };
  const first = await show();
  const ok = first.find((d) => d.status === "draft");
  if (ok) {
    await db.update(schema.outreachDrafts).set({ status: "approved" }).where(eq(schema.outreachDrafts.id, ok.id));
    console.log("== step 2 follow-up (real LLM)");
    console.log(JSON.stringify(await draftForLeads(ws, [ok.leadId], "email")));
    await show();
  }

  console.log("== mock provider, first touch and linkedin note (no key needed)");
  const [profile] = await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.id, (await db.select().from(schema.plays).where(eq(schema.plays.id, playId)))[0].companyProfileId));
  const [wsRow] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws));
  for (const channel of ["email", "linkedin_connect"] as const) {
    const g = await generateDraft({ lead: leads[0], profile, sender: wsRow, channel, stepNumber: 1, intent: "first touch", previousBodies: [] }, mockLlm);
    console.log(`\n[mock ${channel}] blocked=${JSON.stringify(g.blockReasons)}\nSubject: ${g.subject}\n${g.body}`);
  }
  console.log("\nbalance after:", await getBalance(ws));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
