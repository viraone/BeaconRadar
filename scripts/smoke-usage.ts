/** Dev-only: make one real model call attributed to a workspace and print the usage summary + live balance. */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { fetchProviderBalance, loadUsageSummary } from "@/lib/llm/usage";
import { recommendPlays } from "@/lib/plays/recommend";
import { emptyIcp } from "@/lib/profile/icp";

async function main() {
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Demo: TapAndLaunch"));
  const [profile] = await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.workspaceId, ws.id));
  const recs = await recommendPlays({ companyName: profile.companyName, summary: profile.summary, offering: profile.offering, icp: profile.icp ?? emptyIcp(), workspaceId: ws.id });
  console.log("recommendations:", recs.length);
  await new Promise((r) => setTimeout(r, 500)); // recording is fire-and-forget
  const u = await loadUsageSummary(ws.id);
  console.log("usage:", JSON.stringify({ calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, estimatedCostUsd: u.estimatedCostUsd, byTask: u.byTask }));
  console.log("balance:", JSON.stringify(await fetchProviderBalance()));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
