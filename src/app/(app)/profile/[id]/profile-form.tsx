"use client";

import { useActionState } from "react";
import type { Icp } from "@/lib/db/schema";
import { Button, Input, Notice } from "@/components/ui";
import { updateProfile, type EditState } from "./actions";

type Initial = { companyName: string; summary: string; offering: string; icp: Icp };

const LISTS: Array<{ key: keyof Icp; label: string; hint: string }> = [
  { key: "industries", label: "Industries", hint: "e.g. Logistics, Third-party logistics (3PL)" },
  { key: "companySizes", label: "Company sizes", hint: "Employee ranges: 1-10, 11-50, 51-200, 201-1000, 1000+ (or words like mid-market)" },
  { key: "geographies", label: "Geographies", hint: "Countries or regions. Leave empty for global." },
  { key: "buyerTitles", label: "Buyer titles", hint: "e.g. VP Operations, Head of Fulfillment" },
  { key: "painPoints", label: "Pain points", hint: "Problems you solve, in the customer's words" },
  { key: "buyingSignals", label: "Buying signals", hint: "Observable signs a company needs you now, e.g. hiring a warehouse manager" },
  { key: "disqualifiers", label: "Disqualifiers", hint: "Traits that make a company a poor fit" },
];

export function ProfileForm({ profileId, initial, disabled }: { profileId: string; initial: Initial; disabled: boolean }) {
  const action = updateProfile.bind(null, profileId);
  const [state, formAction, pending] = useActionState<EditState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-5" key={JSON.stringify(initial)}>
      <Field label="Company name">
        <Input name="companyName" defaultValue={initial.companyName} disabled={disabled} placeholder="As written on the site" />
      </Field>
      <Field label="What the company does" hint="Two or three plain sentences.">
        <textarea name="summary" defaultValue={initial.summary} disabled={disabled} rows={3} className={textareaCls} />
      </Field>
      <Field label="Offering" hint="One sentence naming the product or service category.">
        <Input name="offering" defaultValue={initial.offering} disabled={disabled} />
      </Field>

      <h3 className="pt-2 font-medium">Ideal customer profile</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {LISTS.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>
            <textarea name={key} defaultValue={initial.icp[key].join("\n")} disabled={disabled} rows={4} className={textareaCls} />
          </Field>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || pending}>{pending ? "Saving…" : "Save profile"}</Button>
        {state?.saved && <span className="text-sm text-green-700 dark:text-green-300">Saved.</span>}
        {state?.error && <Notice kind="error">{state.error}</Notice>}
      </div>
    </form>
  );
}

const textareaCls = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
