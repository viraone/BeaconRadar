"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { STAGE_LABELS, type BeliefStage } from "@/config/outreach";
import { Button, Card, Notice } from "@/components/ui";
import { LogReply } from "@/components/log-reply";
import { draftTaskAction, markTaskDone, redraftTaskAction, skipTaskAction, stopSequenceAction } from "./actions";

export type TaskView = {
  id: string;
  enrollmentId: string;
  channel: string;
  dueAt: string;
  overdue: boolean;
  step: { position: number; intent: string };
  lead: { id: string; playId: string; company: string; person: string | null; title: string | null; email: string | null; emailStatus: string };
  draft: { id: string; subject: string | null; body: string; status: string; blockReasons: string[]; beliefStage: BeliefStage; model: string | null } | null;
};

const CHANNEL_LABEL: Record<string, string> = { linkedin_connect: "LinkedIn connect", linkedin_message: "LinkedIn message", email: "Email" };

export function TaskCard({ task, canSend }: { task: TaskView; canSend: boolean }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | undefined>();
  const [copied, setCopied] = useState(false);
  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      setNotice(undefined);
      const r = await fn();
      if (r?.error) setNotice({ kind: "error", text: r.error });
      else if (r?.message) setNotice({ kind: "success", text: r.message });
    });

  const d = task.draft;
  const isLinkedIn = task.channel.startsWith("linkedin");
  const linkedinSearch = task.lead.person ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${task.lead.person} ${task.lead.company}`)}` : null;
  const text = d ? (task.channel === "email" ? `Subject: ${d.subject ?? ""}\n\n${d.body}` : d.body) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice({ kind: "error", text: "Clipboard blocked; select the text and copy by hand." });
    }
  };
  const mailto = task.channel === "email" && task.lead.email && d ? `mailto:${encodeURIComponent(task.lead.email)}?subject=${encodeURIComponent(d.subject ?? "")}&body=${encodeURIComponent(d.body)}` : null;
  const sendable = d && d.status !== "blocked" && canSend;

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{task.lead.person ?? "no contact"} · {task.lead.company}</div>
          <div className="text-xs text-muted">
            {task.lead.title ?? "title not found"} · <Link href={`/plays/${task.lead.playId}`} className="underline">lead</Link>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <span className="rounded-full border border-border px-2 py-0.5">{CHANNEL_LABEL[task.channel] ?? task.channel} · step {task.step.position}</span>
          <span className={task.overdue ? "text-red-700 dark:text-red-300" : "text-muted"}>due {task.dueAt}</span>
        </div>
      </div>

      {d ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent">{STAGE_LABELS[d.beliefStage]}</span>
            <span>{d.model}{d.model === "mock" ? " (mock text)" : ""}</span>
            <Link href="/drafts" className="underline">edit on Drafts</Link>
          </div>
          {d.blockReasons.length > 0 && (
            <Notice kind="error"><ul className="list-disc pl-4">{d.blockReasons.map((r) => <li key={r}>{r}</li>)}</ul></Notice>
          )}
          <div className="rounded-md border border-border bg-background p-3 font-mono text-sm whitespace-pre-wrap">
            {task.channel === "email" && <div className="mb-2 text-muted">Subject: {d.subject}</div>}
            {d.body}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted">
          <span>No draft yet.</span>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => draftTaskAction(task.id))}>Draft it (1 credit)</Button>
        </div>
      )}

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm">
        {d && <Button variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>}
        {isLinkedIn && linkedinSearch && (
          <a href={linkedinSearch} target="_blank" rel="noreferrer" className="rounded-md border border-border bg-card px-4 py-2 hover:bg-background">Find on LinkedIn ↗</a>
        )}
        {mailto && <a href={mailto} className="rounded-md border border-border bg-card px-4 py-2 hover:bg-background">Open in mail app</a>}
        {d && <Button variant="secondary" disabled={pending} onClick={() => run(() => redraftTaskAction(task.id))}>Regenerate</Button>}
        <Button disabled={!sendable || pending} title={!d ? "Draft first" : d.status === "blocked" ? "Fix the blocked draft first" : !canSend ? "Daily cap reached" : undefined} onClick={() => run(() => markTaskDone(task.id))}>
          Mark done (sent)
        </Button>
        <button className="text-xs text-muted underline" disabled={pending} onClick={() => run(() => skipTaskAction(task.id))}>Skip step</button>
        <button className="ml-auto text-xs text-muted underline" disabled={pending} onClick={() => { if (confirm("Stop this sequence for this person?")) run(() => stopSequenceAction(task.enrollmentId)); }}>Stop sequence</button>
      </div>
      <LogReply leadId={task.lead.id} defaultChannel={task.channel as "email" | "linkedin_connect" | "linkedin_message"} compact />
      {isLinkedIn && <p className="text-xs text-muted">BeaconRadar never touches LinkedIn. Open their profile yourself, paste the note, then mark done.</p>}
    </Card>
  );
}
