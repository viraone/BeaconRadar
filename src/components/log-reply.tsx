"use client";

import { useState, useTransition } from "react";
import { BELIEF_STAGES, STAGE_LABELS } from "@/config/outreach";
import { Button, Notice } from "@/components/ui";
import { logReplyAction } from "@/app/(app)/dashboard/actions";

const OUTCOMES: Array<[string, string]> = [
  ["positive", "Positive: wants to hear more"],
  ["meeting_booked", "Meeting booked"],
  ["neutral", "Neutral: acknowledged, no decision"],
  ["negative", "Negative: not interested"],
  ["wrong_person", "Wrong person"],
  ["opt_out", "Opt-out: asked to stop (suppresses)"],
  ["bounced", "Bounced: email invalid"],
];
const OBJECTIONS: Array<[string, string]> = [
  ["", "No objection"],
  ["authority", "Authority: not the decision-maker"],
  ["no_need", "No need"],
  ["status_quo", "Happy with the status quo"],
  ["timing", "Timing / higher priorities"],
  ["price_value", "Price or value"],
  ["no_budget", "No budget"],
  ["trial_request", "Wants a trial or reference"],
  ["solution_specific", "Solution-specific concern"],
  ["competitor", "Using a competitor"],
  ["other", "Other"],
];

/** Inline reply logger used on tasks, leads and drafts. */
export function LogReply({ leadId, defaultChannel, compact = false }: { leadId: string; defaultChannel: "email" | "linkedin_connect" | "linkedin_message"; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | undefined>();

  if (!open) {
    return (
      <div className="space-y-1">
        <button className={compact ? "text-xs text-muted underline" : "rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-background"} onClick={() => setOpen(true)}>Log reply</button>
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>
    );
  }
  return (
    <form
      className="space-y-2 rounded-md border border-border p-3 text-sm"
      action={(fd) =>
        start(async () => {
          setNotice(undefined);
          const r = await logReplyAction(fd);
          if (r?.error) setNotice({ kind: "error", text: r.error });
          else {
            setNotice({ kind: "success", text: r?.message ?? "Logged." });
            setOpen(false);
          }
        })
      }
    >
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-muted">Channel</span>
          <select name="channel" defaultValue={defaultChannel} className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5">
            <option value="email">Email</option>
            <option value="linkedin_connect">LinkedIn connect</option>
            <option value="linkedin_message">LinkedIn message</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Outcome</span>
          <select name="outcome" defaultValue="positive" className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5">
            {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Objection</span>
          <select name="objectionType" defaultValue="" className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5">
            {OBJECTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">They&apos;ve shown (belief stage)</span>
          <select name="beliefStage" defaultValue="" className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5">
            <option value="">Infer from outcome</option>
            {BELIEF_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted">What they said (paste the reply)</span>
        <textarea name="replyText" rows={3} className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1.5" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save reply"}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <p className="text-xs text-muted">Any reply stops this person&apos;s sequence. An opt-out also adds them to the suppression list.</p>
    </form>
  );
}
