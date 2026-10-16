import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/server";
import { ensureUserAndWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { buildLeadsCsv, canExport } from "@/lib/export/leads";
import { loadSuppression } from "@/lib/outreach/suppression";

/** GET /plays/:id/export -> leads.csv (plan-gated, suppression applied). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const ctx = await ensureUserAndWorkspace(user);
  if (!canExport(ctx.workspace.plan)) {
    return NextResponse.json({ error: "CSV export is not included in the free plan." }, { status: 403 });
  }
  const { id } = await params;
  const [play] = await db.select().from(schema.plays).where(and(eq(schema.plays.id, id), eq(schema.plays.workspaceId, ctx.workspace.id))).limit(1);
  if (!play) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [leads, suppression] = await Promise.all([
    db.select().from(schema.leads).where(eq(schema.leads.playId, id)).orderBy(asc(schema.leads.createdAt)),
    loadSuppression(ctx.workspace.id),
  ]);
  const { csv, exported, suppressed } = buildLeadsCsv(leads, suppression);
  const name = `origami-leads-${play.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || play.id}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "x-origami-exported": String(exported),
      "x-origami-suppressed": String(suppressed),
      "cache-control": "no-store",
    },
  });
}
