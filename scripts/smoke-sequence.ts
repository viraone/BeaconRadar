/** Dev-only: enroll a play's leads in the default sequence, draft step 1, complete it, draft step 2. */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getBalance } from "@/lib/credits/ledger";
import { draftForTask } from "@/lib/outreach/runner";
import { enrollLeads } from "@/lib/sequences/enroll";
import { ensureDefaultSequence } from "@/lib/sequences/sequences";
import { completeTask, listTasks } from "@/lib/sequences/tasks";

async function main() {
  const playId = process.argv[2]!;
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.playId, playId));
  const ws = (await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, leads[0].workspaceId)))[0];
  const [member] = await db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, ws.id));
  console.log("balance before:", await getBalance(ws.id));
  const seq = await ensureDefaultSequence(ws.id);
  console.log("sequence:", seq.name, seq.steps.map((s) => `${s.position}:${s.channel}+${s.waitDays}d`).join(" -> "));
  const outcomes = await enrollLeads({ workspaceId: ws.id, userId: member.userId, sequenceId: seq.id, leadIds: leads.map((l) => l.id) });
  console.log("enroll:", JSON.stringify(outcomes.map((o) => ({ person: o.person, ok: o.ok, reason: o.reason }))));
  const first = outcomes.find((o) => o.ok);
  if (!first) return;
  console.log("draft step 1:", JSON.stringify(await draftForTask(first.taskId!)));
  let { today } = await listTasks(member.userId, ws.id, ws.timezone);
  for (const t of today) console.log(`\n[today] step ${t.step.position} ${t.task.channel} due ${t.task.dueAt.toISOString()} | draft=${t.draft?.status} blocked=${JSON.stringify(t.draft?.blockReasons)}\n${t.draft?.body}`);
  const r = await completeTask({ taskId: first.taskId!, userId: member.userId, workspaceId: ws.id, timeZone: ws.timezone, dailySendCap: ws.dailySendCap });
  console.log("\ncomplete step 1:", JSON.stringify(r));
  const { upcoming } = await listTasks(member.userId, ws.id, ws.timezone);
  const next = upcoming.find((t) => t.lead.id === first.leadId);
  if (next) {
    console.log("draft step 2:", JSON.stringify(await draftForTask(next.task.id)));
    ({ today } = await listTasks(member.userId, ws.id, ws.timezone));
    const all = (await listTasks(member.userId, ws.id, ws.timezone));
    const n2 = all.upcoming.find((t) => t.task.id === next.task.id);
    console.log(`\n[upcoming] step ${n2?.step.position} ${n2?.task.channel} due ${n2?.task.dueAt.toISOString()} | draft=${n2?.draft?.status} blocked=${JSON.stringify(n2?.draft?.blockReasons)} newValue=${JSON.stringify(n2?.draft?.newValue)}\nSubject: ${n2?.draft?.subject}\n${n2?.draft?.body}`);
  }
  console.log("\nbalance after:", await getBalance(ws.id));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e); process.exit(1); });
