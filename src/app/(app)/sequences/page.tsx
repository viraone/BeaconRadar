import { connection } from "next/server";
import { requireWorkspace } from "@/lib/auth/workspace";
import { ensureDefaultSequence, listSequences } from "@/lib/sequences/sequences";
import { Card } from "@/components/ui";
import { StepEditor } from "./step-editor";

export const instant = false;

export default async function SequencesPage() {
  await connection();
  const ctx = await requireWorkspace("/sequences");
  await ensureDefaultSequence(ctx.workspace.id);
  const sequences = await listSequences(ctx.workspace.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sequences</h1>
        <p className="mt-1 text-sm text-muted">
          An ordered list of steps with a wait between them. Each step becomes a task on the Tasks page; you send every message yourself.
          A sequence stops the moment a reply is logged or the person opts out.
        </p>
      </div>
      {sequences.map((seq) => (
        <Card key={seq.id}>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{seq.name}{seq.isDefault && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">default</span>}</h2>
          </div>
          <div className="mt-4">
            <StepEditor sequenceId={seq.id} steps={seq.steps.map((s) => ({ id: s.id, position: s.position, channel: s.channel, waitDays: s.waitDays, intent: s.intent ?? "" }))} />
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted">
        Rules in force: cold first touches target problem awareness only; follow-ups must add something new; at most {ctx.workspace.maxContactsPerCompany} contact{ctx.workspace.maxContactsPerCompany === 1 ? "" : "s"} per company; {ctx.workspace.dailySendCap} sends per day. Change the caps in Settings.
      </p>
    </div>
  );
}
