"use client";

import { useActionState, useTransition } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { addSuppression, removeSuppression, type SettingsResult } from "./actions";

export type SuppressionRow = { id: string; email: string | null; domain: string | null; reason: string; createdAt: string };

export function SuppressionForm({ rows }: { rows: SuppressionRow[] }) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(addSuppression, undefined);
  const [removing, startRemove] = useTransition();
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-2">
        <textarea name="entries" rows={3} placeholder={"jane@acme.com\ncompetitor.com"} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
        <div className="flex gap-2">
          <Input name="reason" placeholder="Reason (optional), e.g. asked to stop" />
          <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
        </div>
        {state?.message && <p className="text-sm text-green-700 dark:text-green-300">{state.message}</p>}
        {state?.error && <Notice kind="error">{state.error}</Notice>}
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing suppressed yet. Anyone who opts out is added here automatically.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                <span className="font-medium">{r.email ?? r.domain}</span>
                <span className="ml-2 text-xs text-muted">{r.email ? "email" : "domain"} · {r.reason} · {r.createdAt}</span>
              </span>
              <button className="text-xs text-muted underline" disabled={removing} onClick={() => startRemove(() => removeSuppression(r.id).then(() => undefined))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
