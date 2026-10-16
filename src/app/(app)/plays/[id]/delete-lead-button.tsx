"use client";

import { useTransition } from "react";
import { deleteLead } from "./lead-actions";

export function DeleteLeadButton({ leadId, playId }: { leadId: string; playId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="text-xs text-muted underline disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (confirm("Remove this lead from the table?")) start(() => deleteLead(leadId, playId).then(() => undefined));
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
