import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { PLAYS } from "@/lib/plays/registry";
import { Card, Notice } from "@/components/ui";
import { AutoRefresh } from "@/app/(app)/profile/[id]/auto-refresh";

export const instant = false;

export default async function PlayLeadsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ctx = await requireWorkspace(`/plays/${id}`);
  const [play] = await db.select().from(schema.plays).where(and(eq(schema.plays.id, id), eq(schema.plays.workspaceId, ctx.workspace.id))).limit(1);
  if (!play) notFound();
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.playId, id)).orderBy(asc(schema.leads.createdAt));
  const running = play.status === "queued" || play.status === "running";
  const isMock = leads.some((l) => l.sourceUrls.some((u) => u.startsWith("mock://")) || /\(MOCK\)/.test(l.company));

  return (
    <div className="space-y-6">
      {running && <AutoRefresh intervalMs={3000} />}
      <div>
        <Link href="/plays" className="text-sm text-muted hover:text-foreground">← All plays</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{play.title}</h1>
        <p className="text-sm text-muted">
          {PLAYS[play.type].label} · {play.status} · {leads.length} leads · {play.creditsSpent} credits spent
        </p>
      </div>

      {running && <Notice>Searching job boards and confirming postings through the official APIs… this page refreshes itself.</Notice>}
      {play.error && <Notice kind={play.status === "failed" ? "error" : "info"}>{play.error}</Notice>}
      {isMock && <Notice>These are <strong>mock leads</strong> from fixture job boards. Set SEARCH_PROVIDER=tavily or brave with a key in .env.local for real results.</Notice>}

      {leads.length === 0 && !running ? (
        <p className="text-sm text-muted">No leads found for this play.</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Person</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Why they fit</th>
                <th className="px-4 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-4 py-2 font-medium">{l.company}</td>
                  <td className="px-4 py-2 text-muted">{l.person ?? "not found"}</td>
                  <td className="px-4 py-2 text-muted">{l.title ?? "not found"}</td>
                  <td className="px-4 py-2 max-w-md">{l.fitReason}</td>
                  <td className="px-4 py-2">
                    {l.sourceUrls.map((u) => (
                      <div key={u} className="truncate max-w-[16rem]">
                        {u.startsWith("http") ? (
                          <a href={u} target="_blank" rel="noreferrer" className="underline">{u.replace(/^https?:\/\//, "")}</a>
                        ) : (
                          <span className="text-muted">{u}</span>
                        )}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted">Person and email columns fill in with the decision-maker play and enrichment in later phases. &quot;not found&quot; means exactly that: nothing is guessed.</p>
    </div>
  );
}
