"use client";

import { useState, useTransition } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { appendStep, dropLastStep, saveStep } from "./actions";

type Step = { id: string; position: number; channel: string; waitDays: number; intent: string };

const CHANNEL_LABEL: Record<string, string> = { linkedin_connect: "LinkedIn connect / note", linkedin_message: "LinkedIn message", email: "Email" };

export function StepEditor({ sequenceId, steps }: { sequenceId: string; steps: Step[] }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | undefined>();
  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      setNotice(undefined);
      const r = await fn();
      if (r?.error) setNotice({ kind: "error", text: r.error });
      else if (r?.message) setNotice({ kind: "success", text: r.message });
    });

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="rounded-md border border-border p-3">
            <form action={(fd) => run(() => saveStep(s.id, fd))} className="grid gap-2 sm:grid-cols-[auto_1fr_auto_1fr_auto] sm:items-center">
              <span className="text-sm font-medium">Step {s.position}</span>
              <select name="channel" defaultValue={s.channel} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
                {Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">{s.position === 1 ? "due" : "wait"}</span>
                {s.position === 1 ? (
                  <span>immediately<input type="hidden" name="waitDays" value={0} /></span>
                ) : (
                  <><Input name="waitDays" type="number" min={0} max={90} defaultValue={s.waitDays} className="w-20" /><span className="text-muted">days after the previous step is done</span></>
                )}
              </label>
              <Input name="intent" defaultValue={s.intent} placeholder="Intent, e.g. proof, resource, breakup" />
              <Button type="submit" variant="secondary" disabled={pending} className="px-3 py-1.5 text-xs">Save</Button>
            </form>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <form action={(fd) => run(() => appendStep(sequenceId, fd))} className="flex items-center gap-2">
          <select name="channel" defaultValue="email" className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
            {Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Input name="waitDays" type="number" min={0} max={90} defaultValue={7} className="w-20" />
          <Button type="submit" variant="secondary" disabled={pending}>Add step</Button>
        </form>
        {steps.length > 1 && <Button variant="secondary" disabled={pending} onClick={() => run(() => dropLastStep(sequenceId))}>Remove last step</Button>}
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </div>
  );
}
