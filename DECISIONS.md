# Decisions log

Ambiguities resolved with the simplest workable option. Newest at the bottom.

| # | Date | Decision | Why / alternative |
|---|---|---|---|
| 1 | 2026-10-13 | Working name "Origami" (workspace folder) instead of `[YOUR_APP_NAME]` | Placeholder was unfilled; rename is a find/replace. |
| 2 | 2026-10-13 | Supabase local stack (`supabase start`) for both Postgres and Auth | One tool, already installed; Clerk would add a vendor. |
| 3 | 2026-10-13 | Drizzle over Prisma | No engine binary, SQL-close (row locks, ON CONFLICT for credits). |
| 4 | 2026-10-13 | Own Postgres job queue (SKIP LOCKED) + `npm run worker` | No extra service/account; swappable behind `enqueue()`. |
| 5 | 2026-10-13 | Every external provider (LLM, search, enrichment) has a `mock` implementation and is the default | App runs and tests pass with zero keys. |
| 6 | 2026-10-13 | Hiring-signal play discovers companies via search API, confirms via official Greenhouse/Lever/Ashby public job-board APIs | Official, ToS-friendly sources with stable posting URLs; no LinkedIn. |
| 7 | 2026-10-13 | Recommender may suggest `decision_makers` and `local_business` plays, but only `hiring_signal` is runnable in Phase 3; others show "coming soon" | Spec asks for one working play first. |
| 8 | 2026-10-13 | "30 rows per table" = max 30 leads per play on the free plan | Simplest reading. |
| 9 | 2026-10-13 | No billing in v1; `workspaces.plan` set by seed/SQL; signup grants starter credits | Billing not in spec. |
| 10 | 2026-10-13 | Credit charges have unique idempotency keys; balance never goes negative (run ends `partial`) | "Deduct only for results found" + safe job retries. |
| 11 | 2026-10-13 | Opt-out line + postal address appended by code, not the LLM; drafting blocked until sender postal address is set | CAN-SPAM requires both; code guarantees presence. |
| 12 | 2026-10-13 | Mock enrichment providers only return addresses on the reserved `.example` TLD and are labeled MOCK in the UI | Dev data can never be mistaken for, or sent to, a real person. |
| 13 | 2026-10-13 | Package manager: npm (pnpm not installed) | Avoids an extra global install. |
| 14 | 2026-10-13 | The "belief ladder" stages are Origami's own rule. They aren't found in *Founding Sales*. | The source check is in `docs/founding-sales-notes.md`. Your spec is kept, with the label corrected. |
| 15 | 2026-10-13 | "Approve" for an email means it's approved, then copied or opened in a mailto link. No sending provider in v1. | Simplest reading that keeps "no auto-send". A real provider is paid or keyed and needs your OK. |
| 16 | 2026-10-13 | Replies are logged by hand with Log reply. No inbox reading. | No email or LinkedIn integration exists in v1. |
| 17 | 2026-10-13 | A lead's belief stage only moves up from a logged reply, and drafts may target at most one stage higher | A code check for "never pitch the solution before the problem is prioritized". |
| 18 | 2026-10-13 | The next step is due `wait_days` after the previous step is marked done, counted in days in the workspace timezone | "No reply after 7 days" counts from the actual touch, not from enrollment. |
| 19 | 2026-10-13 | The daily cap counts LinkedIn tasks marked done plus emails approved, per user per day. The default is 25 and it's configurable. | "20–30 sends/day per sender". The midpoint is the default. |
| 20 | 2026-10-13 | The per-company cap defaults to 2, allows 1–2, matches on `company_domain`, and counts active and completed enrollments | Simplest stable company key. |
| 21 | 2026-10-13 | Leads without a named person can't be enrolled | A LinkedIn step needs a person, and we never make one up. |
| 22 | 2026-10-13 | `objection_type` values follow the book's generic objection list (Ch. 7) plus `other` | Grounded in the source. |
| 23 | 2026-10-13 | Phases renumbered: 6 drafting + checks, 7 sequences + tasks + limits, 8 replies + dashboard, 9 tests/README/seed | Fits the new features into the plan without bloating one phase. |
| 24 | 2026-10-15 | Local Supabase runs on ports 55321–55324 (not the 54321 defaults) | Another local project ("beezer") already holds the defaults. Documented in README. |
| 25 | 2026-10-15 | Next.js 16 with `cacheComponents` on (the scaffold default). Dynamic segments (landing, login, the signed-in layout) declare `instant = false` and call `connection()` first | Next 16 validates static shells; every authed page reads cookies and the DB, so they're request-time by design. |
| 26 | 2026-10-15 | Magic-link email uses a custom template that appends `token_hash` to the app's redirect URL; `/auth/confirm` accepts both `token_hash` and PKCE `code` | Works across browsers and devices and preserves the `next` path. |
| 27 | 2026-10-15 | A URL typed before sign-in is parked in a 30-minute httpOnly cookie and saved by `/auth/confirm` after the session is created | Lets a visitor start from the landing page without an account. |
| 28 | 2026-10-15 | `users.id` mirrors `auth.users.id` but has no foreign key to the auth schema; the row is upserted on first authed request | Keeps the public schema self-contained for Drizzle and tests. |
| 29 | 2026-10-15 | RLS is enabled with no policies on every public table; the app connects with the Postgres role via `DATABASE_URL` and checks membership in code | Blocks direct REST access while keeping one authorization path. |
| 30 | 2026-10-15 | Supabase publishable/secret keys are used (`sb_publishable_…`, `sb_secret_…`) instead of legacy anon/service-role JWTs | Current Supabase convention; both work locally. |
| 31 | 2026-10-15 | `llm.ts` exposes only structured JSON output (`generateJson` with a zod schema); every call also supplies a `mock()` so the mock provider returns grounded, typed data | Keeps prompt injection from crawled pages from ever becoming an action, and lets the whole app run with no API key. |
| 32 | 2026-10-15 | Anthropic calls use the beta messages surface with `fallbacks: "default"` (server-side refusal fallback), adaptive thinking (default), `effort: "medium"`, and a cached system prompt | Declined requests get re-routed instead of failing; medium effort is enough for extraction and keeps cost down. |
| 33 | 2026-10-15 | The fetcher resolves DNS and rejects private, loopback, link-local, carrier-NAT and metadata ranges on every hop; robots.txt failing to load (5xx or unreachable) is treated as "disallow all", a 404 as "allow all" | SSRF protection in code; fail closed when a site's robots state is unknown. DNS re-resolution between check and connect (TOCTOU) is an accepted MVP gap. |
| 34 | 2026-10-15 | The analyzer reads the home page plus up to 5 same-site marketing pages chosen by URL pattern (about, product, pricing, customers); blog, legal, auth and career pages are skipped | Enough signal for a profile at ~6 requests per site. |
| 35 | 2026-10-15 | The company name returned by the model must literally appear on the fetched pages or it is dropped to null | First concrete anti-fabrication check; same pattern will be used for people and titles in Phase 3. |
| 36 | 2026-10-15 | Jobs run inline in the web process after the response (`after()`) when `JOBS_INLINE=true`, which is the dev default; production sets it false and runs `npm run worker` | No worker process needed to try the app locally; the queue table is still the source of truth. |
| 37 | 2026-10-15 | A failed analysis leaves the profile editable; saving the form marks it `ready` | The user can always proceed by hand. |
| 38 | 2026-10-15 | Mock analysis results are labeled `analysis_model = "mock"` and the UI shows a banner | Nobody mistakes echoed headings for a real ICP. |
| 39 | 2026-10-15 | **LLM provider is DeepSeek** (`LLM_PROVIDER=deepseek`, default model `deepseek-flash`), via its OpenAI-compatible chat-completions API with `response_format: json_object`. Anthropic stays as an optional provider. | Your call. DeepSeek JSON mode guarantees valid JSON but not a schema, so the wrapper embeds the JSON Schema in the system prompt, validates with zod, and retries once with the validation errors. No `openai` SDK dependency: one fetch call. |
| 40 | 2026-10-15 | DeepSeek calls do not send `thinking`/`reasoning_effort`; temperature 0.2 | Extraction tasks don't need reasoning mode; cheaper and faster. Revisit for drafting in Phase 6 if quality needs it. |
