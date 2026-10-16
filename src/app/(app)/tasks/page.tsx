import { connection } from "next/server";
import Link from "next/link";
import { eq, and, inArray } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { countDoneToday, listTasks } from "@/lib/sequences/tasks";
import { dailyCapacity } from "@/lib/sequences/limits";
import { Notice } from "@/components/ui";
import { AutoRefresh } from "@/app/(app)/profile/[id]/auto-refresh";
import { TaskCard, type TaskView } from "./task-card";

export const instant = false;

export default async function TasksPage() {
  await connection();
  const ctx = await requireWorkspace("/tasks");
  const tz = ctx.workspace.timezone;
  const [{ today, upcoming }, doneToday] = await Promise.all([listTasks(ctx.user.id, ctx.workspace.id, tz), countDoneToday(ctx.user.id, ctx.workspace.id, tz)]);
  const left = dailyCapacity(ctx.workspace.dailySendCap, doneToday);
  const drafting = (await db.select({ status: schema.jobs.status }).from(schema.jobs).where(and(eq(schema.jobs.type, "draft_task"), inArray(schema.jobs.status, ["queued", "running"])))).length > 0;

  const toView = (r: (typeof today)[number]): TaskView => ({
    id: r.task.id,
    enrollmentId: r.task.enrollmentId,
    channel: r.task.channel,
    dueAt: r.task.dueAt.toLocaleString(undefined, { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    overdue: r.overdue,
    step: { position: r.step.position, intent: r.step.intent ?? "" },
    lead: { id: r.lead.id, playId: r.lead.playId, company: r.lead.company, person: r.lead.person, title: r.lead.title, email: r.lead.email, emailStatus: r.lead.emailStatus },
    draft: r.draft ? { id: r.draft.id, subject: r.draft.subject, body: r.draft.body, status: r.draft.status, blockReasons: r.draft.blockReasons, beliefStage: r.draft.beliefStage, model: r.draft.model } : null,
  });

  return (
    <div className="space-y-6">
      {drafting && <AutoRefresh intervalMs={3000} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s tasks</h1>
          <p className="mt-1 text-sm text-muted">
            Each task is one message you send yourself: copy it, send it from LinkedIn or your mailbox, then mark it done. BeaconRadar never sends for you.
          </p>
        </div>
        <div className="text-sm">
          <span className={`rounded-full border px-3 py-1 ${left === 0 ? "border-red-300 text-red-700 dark:text-red-300" : "border-border text-muted"}`}>
            {left} of {ctx.workspace.dailySendCap} sends left today
          </span>
        </div>
      </div>

      {drafting && <Notice>Writing drafts for new tasks… this page refreshes itself.</Notice>}
      {left === 0 && <Notice>You&apos;ve hit today&apos;s send cap. Remaining tasks roll to tomorrow; change the cap in Settings.</Notice>}

      {today.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing due today. Enroll leads from a play&apos;s leads page (select leads with a contact name, then <strong>Enroll in sequence</strong>), or review your{" "}
          <Link href="/sequences" className="underline">sequence</Link>.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{today.map((r) => <TaskCard key={r.task.id} task={toView(r)} canSend={left > 0} />)}</div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-medium">Upcoming ({upcoming.length})</h2>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {upcoming.map((r) => (
              <li key={r.task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-medium">{r.lead.person ?? "no contact"}</span> · {r.lead.company} · step {r.step.position} ({r.task.channel.replace("_", " ")})
                </span>
                <span className="text-muted">due {r.task.dueAt.toLocaleDateString(undefined, { timeZone: tz, weekday: "short", month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
