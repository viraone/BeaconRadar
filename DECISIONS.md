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
