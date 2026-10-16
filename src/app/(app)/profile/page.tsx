import { connection } from "next/server";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { listProfiles } from "@/lib/profile/save";
import { Card } from "@/components/ui";
import { SiteForm } from "@/app/site-form";

export const instant = false;

export default async function ProfilePage() {
  await connection();
  const ctx = await requireWorkspace("/profile");
  const profiles = await listProfiles(ctx.workspace.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
        <p className="mt-1 text-sm text-muted">
          Add a website. BeaconRadar reads a few public pages and drafts a company profile and ideal customer profile you can edit.
        </p>
      </div>

      <Card>
        <SiteForm compact />
      </Card>

      {profiles.length === 0 ? (
        <p className="text-sm text-muted">No sites yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link href={`/profile/${p.id}`} className="block h-full">
                <Card className="h-full transition hover:border-accent/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.companyName ?? p.domain}</div>
                      <div className="truncate text-sm text-muted">{p.siteUrl}</div>
                    </div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{p.status}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted">
                    {p.summary ?? (p.status === "failed" ? `Analysis failed: ${p.error ?? "unknown error"}` : "Analysis in progress…")}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
