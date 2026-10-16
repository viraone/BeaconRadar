import Link from "next/link";
import { LoginForm } from "./login-form";

// Reads cookies/searchParams on every request, so this segment is dynamic and
// opted out of Next 16's static-shell validation (cacheComponents).
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">← BeaconRadar</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">We’ll email you a one-time sign-in link. No password.</p>
      <div className="mt-6">
        <LoginForm next={next ?? ""} initialError={error} />
      </div>
      <p className="mt-8 text-xs text-muted">
        Local dev: links land in the Mailpit inbox at{" "}
        <a className="underline" href="http://127.0.0.1:55324" target="_blank" rel="noreferrer">127.0.0.1:55324</a>.
      </p>
    </main>
  );
}
