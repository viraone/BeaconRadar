import Link from "next/link";
import { connection } from "next/server";
import { requireWorkspace, getCreditBalance } from "@/lib/auth/workspace";
import { NavLink } from "@/components/ui";

// Reads cookies/searchParams on every request, so this segment is dynamic and
// opted out of Next 16's static-shell validation (cacheComponents).
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection(); // request-time only: reads the session cookie and the DB
  const ctx = await requireWorkspace();
  const balance = await getCreditBalance(ctx.workspace.id);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/profile" className="font-semibold tracking-tight">Origami</Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/profile">Profile</NavLink>
              <NavLink href="/plays">Plays</NavLink>
              <NavLink href="/drafts">Drafts</NavLink>
              <NavLink href="/tasks">Tasks</NavLink>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/settings">Settings</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border border-border px-3 py-1 text-muted" title="Credit balance">
              {balance} credits · {ctx.workspace.plan}
            </span>
            <span className="hidden text-muted md:inline">{ctx.user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="text-muted hover:text-foreground">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
