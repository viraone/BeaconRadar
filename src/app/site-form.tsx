"use client";

import { useActionState } from "react";
import { startWithSite, type StartState } from "./actions";
import { Button, Input, Notice } from "@/components/ui";

export function SiteForm({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startWithSite, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourcompany.com"
          aria-label="Your company website"
          required
          className={compact ? "" : "text-base py-3"}
        />
        <Button type="submit" disabled={pending} className={compact ? "" : "py-3 px-6"}>
          {pending ? "Saving…" : compact ? "Add site" : "Analyze my site"}
        </Button>
      </div>
      {state?.error && <Notice kind="error">{state.error}</Notice>}
    </form>
  );
}
