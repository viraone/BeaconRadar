/** Dev-only: log a positive reply with an objection on a play's first lead and print the metrics. */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { logReply } from "@/lib/replies/log";
import { loadMetrics } from "@/lib/replies/metrics";

async function main() {
  const playId = process.argv[2]!;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.playId, playId));
  const [member] = await db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, lead.workspaceId));
  const r = await logReply({ workspaceId: lead.workspaceId, leadId: lead.id, loggedBy: member.userId, channel: "email", outcome: "positive", objectionType: "timing", replyText: "Interesting. We're mid-hire so maybe next month?" });
  console.log("logReply:", JSON.stringify(r));
  const m = await loadMetrics(lead.workspaceId);
  console.log(JSON.stringify({ contacted: m.contacted, replies: m.replies, positive: m.positive, meetings: m.meetings, replyRate: m.replyRate, byStep: m.byStep, byChannel: m.byChannel, objections: m.objections, awaiting: m.awaitingOutcome }, null, 2));
  const [after] = await db.select({ stage: schema.leads.beliefStage }).from(schema.leads).where(eq(schema.leads.id, lead.id));
  const enrollments = await db.select({ status: schema.sequenceEnrollments.status, reason: schema.sequenceEnrollments.stopReason }).from(schema.sequenceEnrollments).where(eq(schema.sequenceEnrollments.leadId, lead.id));
  console.log("lead stage:", after.stage, "| enrollments:", JSON.stringify(enrollments));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
