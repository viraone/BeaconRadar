import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { getProfile } from "@/lib/profile/save";
import { emptyIcp } from "@/lib/profile/icp";
import { Card, Notice } from "@/components/ui";
import { AutoRefresh } from "./auto-refresh";
import { ProfileForm } from "./profile-form";
import { ActionButtons } from "./action-buttons";

export const instant = false;

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ctx = await requireWorkspace(`/profile/${id}`);
  const profile = await getProfile(ctx.workspace.id, id);
  if (!profile) notFound();

  const running = profile.status === "pending" || profile.status === "analyzing";
  const icp = profile.icp ?? emptyIcp();

  return (
    <div className="space-y-6">
      {running && <AutoRefresh intervalMs={2500} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/profile" className="text-sm text-muted hover:text-foreground">← All sites</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profile.companyName ?? profile.domain}</h1>
          <a href={profile.siteUrl} target="_blank" rel="noreferrer" className="text-sm text-muted underline">{profile.siteUrl}</a>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={profile.status} />
          <ActionButtons profileId={profile.id} running={running} />
        </div>
      </div>

      {running && (
        <Notice>
          {profile.status === "pending" ? "Queued. " : "Reading the site… "}
          Origami fetches a few public pages (home, about, product, pricing) while respecting robots.txt, then drafts the profile. This page refreshes itself.
        </Notice>
      )}
      {profile.status === "failed" && (
        <Notice kind="error">
          Analysis failed: {profile.error ?? "unknown error"}. You can fill the profile in by hand below, or try again.
        </Notice>
      )}
      {profile.analysisModel === "mock" && profile.status === "ready" && (
        <Notice>
          This profile came from the <strong>mock analyzer</strong>, which only echoes text found on the site. Add an Anthropic API key and set
          LLM_PROVIDER=anthropic in .env.local for a real analysis, then click Re-analyze.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="font-medium">Profile and ideal customer</h2>
          <p className="mt-1 text-sm text-muted">Edit anything. One item per line in the lists. Plays in Phase 3 are built from this.</p>
          <div className="mt-4">
            <ProfileForm
              profileId={profile.id}
              disabled={running}
              initial={{
                companyName: profile.companyName ?? "",
                summary: profile.summary ?? "",
                offering: profile.offering ?? "",
                icp,
              }}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-medium">Sources</h2>
            <p className="mt-1 text-sm text-muted">Pages that were read for this profile.</p>
            {profile.sourceUrls.length === 0 ? (
              <p className="mt-3 text-sm text-muted">None yet.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {profile.sourceUrls.map((u) => (
                  <li key={u} className="truncate">
                    <a href={u} target="_blank" rel="noreferrer" className="underline">{u.replace(/^https?:\/\//, "")}</a>
                  </li>
                ))}
              </ul>
            )}
            {profile.analyzedAt && (
              <p className="mt-3 text-xs text-muted">
                Analyzed {profile.analyzedAt.toLocaleString()} by {profile.analysisModel ?? "unknown"}.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ready" ? "border-green-300 text-green-800 dark:border-green-800 dark:text-green-200"
    : status === "failed" ? "border-red-300 text-red-800 dark:border-red-800 dark:text-red-200"
    : "border-border text-muted";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{status}</span>;
}
