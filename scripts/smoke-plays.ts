/**
 * Dev-only end-to-end check for Phase 3 (not part of the app):
 *   recommend plays for a profile (real LLM) -> insert -> run the first hiring play -> report.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-plays.ts <profileId>
 */
import { eq } from "drizzle-orm";
import { PLANS } from "@/config/credits";
import { estimatePlayCredits } from "@/lib/credits/estimate";
import { getBalance } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { recommendPlays } from "@/lib/plays/recommend";
import { runPlay } from "@/lib/plays/runner";
import { emptyIcp } from "@/lib/profile/icp";

async function main() {
  const profileId = process.argv[2]!;
  const [profile] = await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("profile not found");
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, profile.workspaceId)).limit(1);
  console.log("balance before:", await getBalance(ws.id));

  const recs = await recommendPlays({ companyName: profile.companyName, summary: profile.summary, offering: profile.offering, icp: profile.icp ?? emptyIcp() });
  console.log("recommendations:", JSON.stringify(recs.map((r) => ({ type: r.type, title: r.title, params: r.params, runnable: r.runnable })), null, 2));

  const rowLimit = PLANS[ws.plan].rowsPerTable;
  const inserted = await db
    .insert(schema.plays)
    .values(recs.map((r) => ({ workspaceId: ws.id, companyProfileId: profile.id, type: r.type, title: r.title, rationale: r.rationale, params: r.params, rowLimit, creditEstimate: estimatePlayCredits(r.type, rowLimit, ws.plan) })))
    .returning();
  const hiring = inserted.find((p) => p.type === "hiring_signal")!;
  console.log("running play", hiring.id, "estimate", hiring.creditEstimate);
  await runPlay(hiring.id);

  const [after] = await db.select().from(schema.plays).where(eq(schema.plays.id, hiring.id)).limit(1);
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.playId, hiring.id));
  console.log("play status:", after.status, "spent:", after.creditsSpent, "error:", after.error);
  console.log("leads:", JSON.stringify(leads.map((l) => ({ company: l.company, person: l.person, fit: l.fitReason.slice(0, 90), sources: l.sourceUrls })), null, 2));
  console.log("balance after:", await getBalance(ws.id));
  console.log("PLAY_ID=" + hiring.id);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
