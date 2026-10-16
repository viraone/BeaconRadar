"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Card, Input, Notice } from "@/components/ui";
import { approvePlay, deletePlay, updateHiringRoles } from "./actions";

type PlayView = {
  id: string;
  type: string;
  title: string;
  rationale: string | null;
  params: Record<string, unknown>;
  status: string;
  creditEstimate: number;
  creditsSpent: number;
  error: string | null;
  rowLimit: number;
};

export function PlayCard({ play, label, runnable, balance }: { play: PlayView; label: string; runnable: boolean; balance: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const roles = Array.isArray(play.params.roles) ? (play.params.roles as string[]) : [];
  const [rolesText, setRolesText] = useState(roles.join(", "));
  const running = play.status === "queued" || play.status === "running";
  const finished = play.status === "completed" || play.status === "partial";
  const canApprove = runnable && !running && balance > 0;

  const act = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r?.error) setError(r.error);
    });

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
          <h3 className="font-medium">{play.title}</h3>
        </div>
        <StatusBadge status={running ? play.status : runnable ? play.status : "coming soon"} />
      </div>
      {play.rationale && <p className="text-sm text-muted">{play.rationale}</p>}

      <ParamsView play={play} />

      {play.type === "hiring_signal" && play.status === "draft" && (
        <div className="space-y-2">
          {editing ? (
            <div className="flex gap-2">
              <Input value={rolesText} onChange={(e) => setRolesText(e.target.value)} placeholder="Roles, comma-separated" />
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    const r = await updateHiringRoles(play.id, rolesText);
                    if (!r?.error) setEditing(false);
                    return r;
                  })
                }
              >
                Save
              </Button>
            </div>
          ) : (
            <button className="text-xs text-muted underline" onClick={() => setEditing(true)}>Edit roles</button>
          )}
        </div>
      )}

      {play.error && <Notice kind={play.status === "failed" ? "error" : "info"}>{play.error}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
        <span className="text-muted">
          {finished ? `${play.creditsSpent} credits spent` : `Up to ${play.creditEstimate} credits (${play.rowLimit} rows max)`}
        </span>
        <div className="flex items-center gap-2">
          {finished && <Link href={`/plays/${play.id}`} className="underline">View leads →</Link>}
          {!running && play.status === "draft" && (
            <Button variant="secondary" disabled={pending} onClick={() => act(() => deletePlay(play.id))}>Dismiss</Button>
          )}
          {!running && (
            <Button disabled={!canApprove || pending} title={!runnable ? "Coming in a later phase" : balance <= 0 ? "No credits" : undefined} onClick={() => act(() => approvePlay(play.id))}>
              {finished || play.status === "failed" ? "Run again" : "Approve & run"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ParamsView({ play }: { play: PlayView }) {
  const p = play.params;
  const items: string[] = [];
  if (Array.isArray(p.roles)) items.push(`Roles: ${(p.roles as string[]).join(", ")}`);
  if (Array.isArray(p.buyerTitles)) items.push(`Titles: ${(p.buyerTitles as string[]).join(", ")}`);
  if (typeof p.category === "string") items.push(`Category: ${p.category}${p.city ? ` in ${p.city}` : ""}`);
  if (typeof p.location === "string" && p.location) items.push(`Location: ${p.location}`);
  if (items.length === 0) return null;
  return (
    <ul className="text-sm">
      {items.map((i) => (
        <li key={i} className="text-muted">{i}</li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" ? "border-green-300 text-green-800 dark:border-green-800 dark:text-green-200"
    : status === "failed" ? "border-red-300 text-red-800 dark:border-red-800 dark:text-red-200"
    : status === "running" || status === "queued" ? "border-accent/50 text-accent"
    : "border-border text-muted";
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{status}</span>;
}
