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
