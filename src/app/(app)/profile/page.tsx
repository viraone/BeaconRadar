import { connection } from "next/server";
import { requireWorkspace } from "@/lib/auth/workspace";
import { listProfiles } from "@/lib/profile/save";
import { Card, Notice } from "@/components/ui";
import { SiteForm } from "@/app/site-form";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await connection();
  const ctx = await requireWorkspace("/profile");
  const { saved } = await searchParams;
  const profiles = await listProfiles(ctx.workspace.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company profile</h1>
        <p className="mt-1 text-sm text-muted">
          Add your website. In Phase 2, Origami reads it and drafts your ideal customer profile for you to edit.
        </p>
      </div>

      {saved && (
        <Notice kind="success">
          {`Saved ${saved}. You’re signed in and ready for the site analysis (coming in Phase 2).`}
        </Notice>
      )}

      <Card>
        <SiteForm compact />
      </Card>

      {profiles.length === 0 ? (
        <p className="text-sm text-muted">No sites yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.companyName ?? p.domain}</div>
                    <a href={p.siteUrl} target="_blank" rel="noreferrer" className="text-sm text-muted underline">{p.siteUrl}</a>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{p.status}</span>
                </div>
                <p className="mt-3 text-sm text-muted">
                  {p.summary ?? "Analysis not run yet. The site analyzer arrives in Phase 2."}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
