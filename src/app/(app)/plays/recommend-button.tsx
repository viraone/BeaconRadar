"use client";

import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { recommendForProfile } from "./actions";

export function RecommendButton({ profileId, label, disabled }: { profileId: string; label: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={disabled || pending}
        title={disabled ? "Finish the site analysis first" : undefined}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await recommendForProfile(profileId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Thinking…" : `Recommend for ${label}`}
      </Button>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}
