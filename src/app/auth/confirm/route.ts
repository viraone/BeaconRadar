import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ensureUserAndWorkspace } from "@/lib/auth/workspace";
import { PENDING_SITE_COOKIE } from "@/lib/profile/pending-cookie";
import { startSiteAnalysis } from "@/lib/profile/analysis-job";
import { saveSiteUrl } from "@/lib/profile/save";
import { normalizeSiteUrl } from "@/lib/profile/url";

/**
 * Magic-link landing. Supports both link styles:
 *  - token_hash + type (our custom email template, works across browsers)
 *  - code (PKCE flow, Supabase default template)
 * If the user typed a website on the landing page before signing in, it is parked in a
 * cookie; we save it to their workspace here and clear the cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/profile";
  let next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/profile";

  const supabase = await createSupabaseServerClient();
  let errorMessage: string | null = null;
  let userId: string | undefined;
  let email: string | undefined | null;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
    userId = data.user?.id;
    email = data.user?.email;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
    userId = data.user?.id;
    email = data.user?.email;
  } else {
    errorMessage = "Missing sign-in token.";
  }

  if (errorMessage || !userId || !email) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", `Sign-in link invalid or expired (${errorMessage ?? "no user"}). Request a new one.`);
    return NextResponse.redirect(url);
  }

  const pending = request.cookies.get(PENDING_SITE_COOKIE)?.value;
  if (pending) {
    try {
      const site = normalizeSiteUrl(pending);
      const ctx = await ensureUserAndWorkspace({ id: userId, email });
      const { profile, created } = await saveSiteUrl(ctx.workspace.id, site);
      if (created) await startSiteAnalysis(profile.id);
      next = `/profile/${profile.id}`;
    } catch {
      // A bad cookie should never block sign-in.
    }
  }

  const response = NextResponse.redirect(new URL(next, origin));
  if (pending) response.cookies.delete(PENDING_SITE_COOKIE);
  return response;
}
