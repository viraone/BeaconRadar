"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";
import { Button, Input, Notice } from "@/components/ui";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, initialError ? { error: initialError } : undefined);

  if (state?.sent) {
    return (
      <Notice kind="success">
        Check <strong>{state.email}</strong> for your sign-in link. You can close this tab.
      </Notice>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required autoFocus />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state?.error && <Notice kind="error">{state.error}</Notice>}
    </form>
  );
}
