"use client";

import { useActionState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { updateSender, type SettingsResult } from "./actions";

type Initial = { senderName: string; senderCompany: string; senderPostalAddress: string; dailySendCap: number; maxContactsPerCompany: number };

export function SenderForm({ initial, canEdit }: { initial: Initial; canEdit: boolean }) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(updateSender, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="font-medium">Your name</span>
        <Input name="senderName" defaultValue={initial.senderName} disabled={!canEdit} required className="mt-1" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Company</span>
        <Input name="senderCompany" defaultValue={initial.senderCompany} disabled={!canEdit} required className="mt-1" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Postal address</span>
        <span className="block text-xs text-muted">Required by CAN-SPAM. Appears in every email footer.</span>
        <textarea name="senderPostalAddress" defaultValue={initial.senderPostalAddress} disabled={!canEdit} required rows={2} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">Daily send cap</span>
          <Input name="dailySendCap" type="number" min={1} max={200} defaultValue={initial.dailySendCap} disabled={!canEdit} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Contacts per company</span>
          <Input name="maxContactsPerCompany" type="number" min={1} max={2} defaultValue={initial.maxContactsPerCompany} disabled={!canEdit} className="mt-1" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canEdit || pending}>{pending ? "Saving…" : "Save sender details"}</Button>
        {state?.message && <span className="text-sm text-green-700 dark:text-green-300">{state.message}</span>}
      </div>
      {state?.error && <Notice kind="error">{state.error}</Notice>}
    </form>
  );
}
