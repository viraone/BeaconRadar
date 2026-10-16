import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/server";
import { ensureUserAndWorkspace } from "@/lib/auth/workspace";
import { toCsv } from "@/lib/csv";
import { db, schema } from "@/lib/db/client";
import { canExport } from "@/lib/export/leads";

/** GET /drafts/export -> approved and sent drafts as CSV (plan-gated). */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const ctx = await ensureUserAndWorkspace(user);
  if (!canExport(ctx.workspace.plan)) return NextResponse.json({ error: "CSV export is not included in the free plan." }, { status: 403 });

  const rows = await db
    .select({ d: schema.outreachDrafts, l: schema.leads })
    .from(schema.outreachDrafts)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.outreachDrafts.leadId))
    .where(and(eq(schema.outreachDrafts.workspaceId, ctx.workspace.id), inArray(schema.outreachDrafts.status, ["approved", "sent_manually"])))
    .orderBy(desc(schema.outreachDrafts.createdAt));

  const csv = toCsv([
    ["company", "person", "title", "email", "email_status", "channel", "belief_stage", "status", "subject", "body", "source_urls", "approved_at"],
    ...rows.map(({ d, l }) => [l.company, l.person ?? "not found", l.title ?? "not found", l.email ?? "not found", l.emailStatus, d.channel, d.beliefStage, d.status, d.subject ?? "", d.body, l.sourceUrls.join(" "), d.updatedAt.toISOString()]),
  ]);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="beaconradar-drafts.csv"', "cache-control": "no-store" },
  });
}
