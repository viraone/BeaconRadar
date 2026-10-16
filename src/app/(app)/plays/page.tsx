import { connection } from "next/server";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { listProfiles } from "@/lib/profile/save";
import { PLAYS } from "@/lib/plays/registry";
import { Card, Notice } from "@/components/ui";
import { PlayCard } from "./play-card";
import { RecommendButton } from "./recommend-button";
import { AutoRefresh } from "@/app/(app)/profile/[id]/auto-refresh";

export const instant = false;

export default async function PlaysPage() {
  await connection();
  const ctx = await requireWorkspace("/plays");
  const [profiles, balance, plays] = await Promise.all([
    listProfiles(ctx.workspace.id),
    getCreditBalance(ctx.workspace.id),
    db.select().from(schema.plays).where(eq(schema.plays.workspaceId, ctx.workspace.id)).orderBy(desc(schema.plays.createdAt)),
  ]);
  const anyRunning = plays.some((p) => p.status === "queued" || p.status === "running");

  return (
    <div className="space-y-6">
      {anyRunning && <AutoRefresh intervalMs={3000} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plays</h1>
          <p className="mt-1 text-sm text-muted">
            One-click campaigns built from your profile. Each shows a credit estimate before you approve it. You pay only for leads actually found.
          </p>
        </div>
        <div className="text-sm text-muted">Balance: <strong className="text-foreground">{balance}</strong> credits</div>
      </div>

      {profiles.length === 0 ? (
        <Notice>
          Add a website on the <Link className="underline" href="/profile">Profile</Link> page first.
        </Notice>
      ) : (
        <Card>
          <h2 className="font-medium">Recommend plays</h2>
          <p className="mt-1 text-sm text-muted">BeaconRadar reads the ideal customer profile and proposes 3 to 5 plays. Nothing runs until you approve a play.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {profiles.map((p) => (
              <RecommendButton key={p.id} profileId={p.id} label={p.companyName ?? p.domain} disabled={p.status !== "ready"} />
            ))}
          </div>
        </Card>
      )}

      {plays.length === 0 ? (
        <p className="text-sm text-muted">No plays yet.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {plays.map((play) => (
            <li key={play.id}>
              <PlayCard
                play={{
                  id: play.id,
                  type: play.type,
                  title: play.title,
                  rationale: play.rationale,
                  params: play.params,
                  status: play.status,
                  creditEstimate: play.creditEstimate,
                  creditsSpent: play.creditsSpent,
                  error: play.error,
                  rowLimit: play.rowLimit,
                }}
                label={PLAYS[play.type].label}
                runnable={PLAYS[play.type].runnable}
                balance={balance}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
