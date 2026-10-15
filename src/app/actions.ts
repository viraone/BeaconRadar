"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/server";
import { ensureUserAndWorkspace } from "@/lib/auth/workspace";
import { startSiteAnalysis } from "@/lib/profile/analysis-job";
import { PENDING_SITE_COOKIE } from "@/lib/profile/pending-cookie";
import { saveSiteUrl } from "@/lib/profile/save";
import { normalizeSiteUrl } from "@/lib/profile/url";

export type StartState = { error?: string } | undefined;

/**
 * Landing-page form. Signed-out users get the URL parked in a short-lived cookie
 * and are sent to sign in; /auth/confirm picks it up after login.
 */
export async function startWithSite(_prev: StartState, formData: FormData): Promise<StartState> {
  let site;
  try {
    site = normalizeSiteUrl(String(formData.get("url") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const user = await getAuthUser();
  if (!user) {
    const store = await cookies();
    store.set(PENDING_SITE_COOKIE, site.siteUrl, { httpOnly: true, sameSite: "lax", maxAge: 60 * 30, path: "/" });
    redirect("/login?next=/profile");
  }

  const ctx = await ensureUserAndWorkspace(user);
  const { profile, created } = await saveSiteUrl(ctx.workspace.id, site);
  if (created) await startSiteAnalysis(profile.id);
  redirect(`/profile/${profile.id}`);
}
