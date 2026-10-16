"use client";

import { useState, useTransition } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { deleteLead, enrichLeadsAction, updateLeadContact } from "./lead-actions";

export type LeadView = {
  id: string;
  company: string;
  companyDomain: string | null;
  person: string | null;
  title: string | null;
  email: string | null;
  emailStatus: string;
  emailProvider: string | null;
  emailIsMock: boolean;
  fitReason: string | null;
  sourceUrls: string[];
  suppressed: boolean;
};

export function LeadsTable({ playId, leads, balance, perEmailCost }: { playId: string; leads: LeadView[]; balance: number; perEmailCost: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | undefined>();
  const [editing, setEditing] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allIds = leads.map((l) => l.id);
  const withoutEmail = leads.filter((l) => !l.email).length;

  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      setNotice(undefined);
      const r = await fn();
      if (r?.error) setNotice({ kind: "error", text: r.error });
      else if (r?.message) setNotice({ kind: "success", text: r.message });
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button variant="secondary" disabled={pending || selected.size === 0} onClick={() => run(() => enrichLeadsAction(playId, Array.from(selected)))}>
          Enrich {selected.size || ""} selected
        </Button>
        <Button variant="secondary" disabled={pending || withoutEmail === 0} onClick={() => run(() => enrichLeadsAction(playId, []))}>
          Enrich all without email ({withoutEmail})
        </Button>
        <span className="text-muted">Up to {perEmailCost} credits per lead (2 to find, +1 if verified). Balance: {balance}. Charged only when an email is found.</span>
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" aria-label="Select all" checked={selected.size === allIds.length && allIds.length > 0} onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())} />
              </th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Why they fit</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((l) => (
              <tr key={l.id} className={`align-top ${l.suppressed ? "opacity-60" : ""}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.company}`} /></td>
                <td className="px-3 py-2 font-medium">
                  {l.company}
                  {l.companyDomain && <div className="text-xs font-normal text-muted">{l.companyDomain}</div>}
                  {l.suppressed && <div className="text-xs font-normal text-red-700 dark:text-red-300">suppressed</div>}
                </td>
                <td className="px-3 py-2">
                  {editing === l.id ? (
                    <form
                      className="space-y-1"
                      action={(fd) =>
                        run(async () => {
                          const r = await updateLeadContact(l.id, playId, fd);
                          if (!r?.error) setEditing(null);
                          return r;
                        })
                      }
                    >
                      <Input name="person" defaultValue={l.person ?? ""} placeholder="Full name" className="min-w-40" />
                      <Input name="title" defaultValue={l.title ?? ""} placeholder="Title" className="min-w-40" />
                      <Input name="companyDomain" defaultValue={l.companyDomain ?? ""} placeholder="company.com" className="min-w-40" />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={pending} className="px-2 py-1 text-xs">Save</Button>
                        <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <div className={l.person ? "" : "text-muted"}>{l.person ?? "not found"}</div>
                      <div className="text-xs text-muted">{l.title ?? (l.person ? "" : "not found")}</div>
                      <button className="mt-1 text-xs text-muted underline" onClick={() => setEditing(l.id)}>{l.person ? "Edit contact" : "Add contact"}</button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className={l.email ? "" : "text-muted"}>{l.email ?? "not found"}</div>
                  <div className="text-xs text-muted">
                    {l.emailStatus}
                    {l.emailProvider ? ` · ${l.emailProvider}` : ""}
                    {l.emailIsMock && <span className="ml-1 rounded border border-border px-1">mock</span>}
                  </div>
                </td>
                <td className="max-w-md px-3 py-2">{l.fitReason}</td>
                <td className="px-3 py-2">
                  {l.sourceUrls.map((u) => (
                    <div key={u} className="max-w-[16rem] truncate">
                      {u.startsWith("http") ? <a href={u} target="_blank" rel="noreferrer" className="underline">{u.replace(/^https?:\/\//, "")}</a> : <span className="text-muted">{u}</span>}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2">
                  <button className="text-xs text-muted underline disabled:opacity-50" disabled={pending} onClick={() => { if (confirm("Remove this lead from the table?")) run(() => deleteLead(l.id, playId)); }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
