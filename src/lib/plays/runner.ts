import { eq, sql } from "drizzle-orm";
import { CREDIT_COSTS, PLANS } from "@/config/credits";
import { chargeOnce } from "@/lib/credits/ledger";
import { db, schema } from "@/lib/db/client";
import { getLlm } from "@/lib/llm/llm";
import { getAtsClient } from "@/lib/research/ats";
import { getSearch } from "@/lib/research/search";
import { getPlay } from "./registry";
import type { PlayRunContext } from "./types";

/**
 * Runs an approved play: produces lead drafts, then writes each lead and charges
 * one search_result credit for it in the same transaction. Stops early (status
 * `partial`) when the balance runs out. Idempotent per lead via the ledger key.
 */
export async function runPlay(playId: string, deps: Partial<Pick<PlayRunContext, "search" | "ats" | "llm">> = {}): Promise<void> {
  const [play] = await db.select().from(schema.plays).where(eq(schema.plays.id, playId)).limit(1);
  if (!play) return;
  const [profile] = await db.select().from(schema.companyProfiles).where(eq(schema.companyProfiles.id, play.companyProfileId)).limit(1);
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, play.workspaceId)).limit(1);
  if (!profile || !workspace) {
    await fail(playId, "Profile or workspace no longer exists.");
    return;
  }

  const definition = getPlay(play.type);
  if (!definition.runnable) {
    await fail(playId, `${definition.label} is not available yet.`);
    return;
  }

  await db.update(schema.plays).set({ status: "running", startedAt: new Date(), error: null, updatedAt: new Date() }).where(eq(schema.plays.id, playId));

  const maxLeads = Math.min(play.rowLimit, PLANS[workspace.plan].rowsPerTable);
  const logs: string[] = [];
  const ctx: PlayRunContext = {
    play,
    icp: profile,
    maxLeads,
    search: deps.search ?? getSearch(),
    ats: deps.ats ?? getAtsClient(),
    llm: deps.llm ?? getLlm(),
    log: (m) => logs.push(m),
  };

  let produced;
  try {
    produced = await definition.run(ctx, definition.parseParams(play.params));
  } catch (e) {
    await fail(playId, (e as Error).message);
    throw e;
  }

  let written = 0;
  let spent = 0;
  let outOfCredits = false;
  for (const draft of produced.leads) {
    if (written >= maxLeads) break;
    if (draft.sourceUrls.length === 0) {
      logs.push(`skipped ${draft.company}: no source URL`);
      continue;
    }
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.leads)
        .values({
          playId,
          workspaceId: play.workspaceId,
          company: draft.company,
          companyDomain: draft.companyDomain,
          person: draft.person,
          title: draft.title,
          sourceUrls: draft.sourceUrls,
          fitReason: draft.fitReason,
          signal: draft.signal,
        })
        .onConflictDoNothing()
        .returning({ id: schema.leads.id });
      const lead = inserted[0];
      if (!lead) return { status: "duplicate" as const };

      const charge = await chargeOnce(
        {
          workspaceId: play.workspaceId,
          amount: CREDIT_COSTS.search_result,
          action: "search_result",
          reason: `Lead found: ${draft.company}`,
          refType: "lead",
          refId: lead.id,
          idempotencyKey: `lead:${lead.id}:search_result`,
        },
        tx,
      );
      if (!charge.ok) {
        // roll back this lead: we only keep rows we could pay for
        await tx.delete(schema.leads).where(eq(schema.leads.id, lead.id));
        return { status: "insufficient" as const };
      }
      return { status: "written" as const, charged: charge.charged };
    });

    if (result.status === "insufficient") {
      outOfCredits = true;
      break;
    }
    if (result.status === "written") {
      written++;
      if (result.charged) spent += CREDIT_COSTS.search_result;
    }
  }

  const status = outOfCredits ? "partial" : "completed";
  await db
    .update(schema.plays)
    .set({
      status,
      creditsSpent: sql`${schema.plays.creditsSpent} + ${spent}`,
      error: outOfCredits ? `Stopped after ${written} leads: out of credits.` : null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.plays.id, playId));
  console.log(`[play ${playId}] ${status}: ${written} leads written, ${spent} credits; ${produced.notes.join(" | ")}; ${logs.join(" | ")}`);
}

async function fail(playId: string, message: string) {
  await db.update(schema.plays).set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.plays.id, playId));
}
