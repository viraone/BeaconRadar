"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { STAGE_LABELS, type BeliefStage } from "@/config/outreach";
import { Button, Card, Input, Notice } from "@/components/ui";
import { editDraft, regenerateDraft, setDraftStatus } from "./actions";

export type DraftView = {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  beliefStage: BeliefStage;
  newValue: { type: string; detail: string } | null;
  status: string;
  blockReasons: string[];
  model: string | null;
  createdAt: string;
  lead: { id: string; playId: string; company: string; person: string | null; title: string | null; email: string | null; emailStatus: string; sourceUrls: string[] };
};

function splitFooter(body: string): { message: string; footer: string } {
  const i = body.indexOf("\n--\n");
  return i === -1 ? { message: body, footer: "" } : { message: body.slice(0, i), footer: body.slice(i + 1) };
}

export function DraftCard({ draft }: { draft: DraftView }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | undefined>();
  const [editing, setEditing] = useState(false);
  const { message, footer } = splitFooter(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      setNotice(undefined);
      const r = await fn();
      if (r?.error) setNotice({ kind: "error", text: r.error });
      else if (r?.message) setNotice({ kind: "success", text: r.message });
    });

  const fullText = draft.channel === "email" ? `Subject: ${draft.subject ?? ""}\n\n${draft.body}` : draft.body;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice({ kind: "error", text: "Clipboard blocked by the browser. Select the text and copy it by hand." });
    }
  };
  const mailto = draft.lead.email && draft.channel === "email"
    ? `mailto:${encodeURIComponent(draft.lead.email)}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.body)}`
    : null;
  const canApprove = draft.status === "draft";
  const isMock = draft.model === "mock";

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">
            {draft.lead.person ?? "no contact"} · {draft.lead.company}
          </div>
          <div className="text-xs text-muted">
            {draft.lead.title ?? "title not found"} · {draft.lead.email ?? "email not found"} ({draft.lead.emailStatus}) ·{" "}
            <Link href={`/plays/${draft.lead.playId}`} className="underline">lead</Link>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs">{draft.status}</span>
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent" title="Belief-ladder stage this message targets">{STAGE_LABELS[draft.beliefStage]}</span>
        </div>
      </div>

      <div className="text-xs text-muted">
        {draft.channel} · step {draft.newValue ? "follow-up" : "1"} · {draft.model ?? "model unknown"}{isMock ? " (mock text: add an LLM key for real drafts)" : ""} · {draft.createdAt}
      </div>

      {draft.blockReasons.length > 0 && (
        <Notice kind="error">
          <ul className="list-disc pl-4">{draft.blockReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Notice>
      )}
      {draft.newValue && <div className="text-xs text-muted">Adds ({draft.newValue.type}): {draft.newValue.detail}</div>}

      {editing ? (
        <div className="space-y-2">
          {draft.channel === "email" && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm" />
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(async () => { const r = await editDraft(draft.id, subject, text); if (!r?.error) setEditing(false); return r; })}>Save and re-check</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-background p-3 font-mono text-sm whitespace-pre-wrap">
          {draft.channel === "email" && <div className="mb-2 text-muted">Subject: {draft.subject}</div>}
          {message}
          {footer && <div className="mt-2 border-t border-border pt-2 text-xs text-muted whitespace-pre-wrap">{footer}</div>}
        </div>
      )}

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm">
        <Button variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        {draft.status !== "discarded" && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
        {draft.status !== "discarded" && <Button variant="secondary" disabled={pending} onClick={() => run(() => regenerateDraft(draft.id))}>Regenerate</Button>}
        {canApprove && <Button disabled={pending} onClick={() => run(() => setDraftStatus(draft.id, "approved"))}>Approve</Button>}
        {draft.status === "approved" && mailto && <a href={mailto} className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90">Open in mail app</a>}
        {draft.status === "approved" && <Button variant="secondary" disabled={pending} onClick={() => run(() => setDraftStatus(draft.id, "sent_manually"))}>Mark as sent</Button>}
        {draft.status !== "discarded" && draft.status !== "sent_manually" && (
          <button className="ml-auto text-xs text-muted underline" disabled={pending} onClick={() => run(() => setDraftStatus(draft.id, "discarded"))}>Discard</button>
        )}
      </div>
    </Card>
  );
}
