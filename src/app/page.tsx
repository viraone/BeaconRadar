import Link from "next/link";
import { connection } from "next/server";
import { getAuthUser } from "@/lib/auth/server";
import { SiteForm } from "./site-form";

// Reads cookies/searchParams on every request, so this segment is dynamic and
// opted out of Next 16's static-shell validation (cacheComponents).
export const instant = false;

export default async function LandingPage() {
  await connection(); // request-time only: reads the session cookie and the DB
  const user = await getAuthUser();
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold tracking-tight">Origami</span>
        <nav className="text-sm">
          {user ? (
            <Link href="/profile" className="text-muted hover:text-foreground">Open app →</Link>
          ) : (
            <Link href="/login" className="text-muted hover:text-foreground">Sign in</Link>
          )}
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Your website in. <span className="text-accent">Leads with sources</span> out.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Origami reads your site, works out who you sell to, and suggests one-click plays that find real
          companies and people from live, licensed sources. Every row cites where it came from. Nothing is
          sent without your review.
        </p>
        <div className="mt-8">
          <SiteForm />
        </div>
        <ul className="mt-10 grid gap-3 text-sm text-muted sm:grid-cols-3">
          <li>1. We read your site and draft your ideal customer profile. You edit it.</li>
          <li>2. Pick a play, see the credit estimate, approve it.</li>
          <li>3. Review leads, enrich emails, and approve every message yourself.</li>
        </ul>
      </section>
    </main>
  );
}
