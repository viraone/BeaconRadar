"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteProfile, reanalyzeProfile } from "./actions";

export function ActionButtons({ profileId, running }: { profileId: string; running: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" disabled={running || pending} onClick={() => start(() => reanalyzeProfile(profileId))}>
        {running ? "Analyzing…" : "Re-analyze"}
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this site and its profile? Plays and leads built from it will be deleted too.")) {
            start(() => deleteProfile(profileId));
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}
