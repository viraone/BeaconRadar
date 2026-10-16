# BeaconRadar — MVP Plan (Phase 0)

> Name: **BeaconRadar** (renamed from the working name Origami on 2026-10-15; the folder is still `origami`).
> Status: **approved 2026-10-15.** All phases (1–9) complete; see the phase table in §9 and README.md.

## 1. What we're building

A user enters their company website. BeaconRadar then:

1. Reads the site (only robots.txt-allowed pages) and infers a **company profile + ICP** that the user can edit.
2. Recommends **3–5 plays** (one-click campaigns) based on that ICP.
3. Runs an approved play as a **background research job** that turns live, licensed sources into a **leads table**. Every row carries source URLs.
4. Optionally **enriches** leads with a work email through a pluggable **provider waterfall**. It stops at the first verified result.
5. **Drafts** short, problem-first messages. Each is tagged with the buyer's belief stage and checked by code rules: short, one yes/no ask, no "just checking in".
6. Runs **human-in-the-loop sequences**. The default is a LinkedIn step, then an email follow-up 7 days later if there's no reply. Each day's steps appear in a **"today's tasks"** queue. LinkedIn steps are always sent by hand: copy, send, mark done. Email steps send only after an explicit **Approve** click. A logged reply or opt-out stops the sequence at once.
7. Runs a **founder learning loop**. Every reply and objection is logged per lead, and a dashboard shows contacted, replies, positive replies and meetings. There is no open rate.
8. Enforces **limits**: 1–2 contacts per company, about 25 sends per sender per day, the suppression list, and an opt-out line on every email.

Background reading for 5–7 is in `docs/founding-sales-notes.md`. Note that the "belief ladder" isn't in *Founding Sales*. We implement it as BeaconRadar's own rule, as specified.

Hard rules, enforced in code as well as in prompts:
- Never fabricate people, emails, or facts. A field that can't be grounded in a fetched source is stored as `null` and rendered as **"not found"**.
- Every lead has `source_urls.length >= 1` (DB check constraint plus a write-path assertion).
- No LinkedIn or other scraping-prohibited sites. Use official APIs, respect robots.txt, and send an honest User-Agent.

## 2. Stack (with reasons)

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js (App Router, latest stable) + TypeScript + Tailwind** | Your preference. Server Actions and Route Handlers cover the API with no separate backend. |
| DB | **Postgres via Supabase**. Local dev runs `supabase start` (Docker), which is already installed. | One local stack gives Postgres, Auth, and Studio. The same thing runs hosted on Supabase later. |
| ORM | **Drizzle** (+ drizzle-kit migrations) | Lighter than Prisma, with no query-engine binary. It reads like SQL, so row locks and `ON CONFLICT` are easy, and that matters for credits. It talks to Supabase Postgres directly. |
| Auth | **Supabase Auth** (email magic link + optional Google OAuth) via `@supabase/ssr` | It comes with the DB stack. Clerk would be a second vendor plus keys. |
| LLM | **DeepSeek** (`deepseek-flash` by default, `deepseek-v4-pro` optional) through `src/lib/llm/llm.ts`, using its OpenAI-compatible JSON mode. Anthropic remains available as a second provider. | Your choice (2026-10-15). DeepSeek doesn't enforce a JSON schema server-side, so the wrapper puts the schema in the prompt, validates with zod and retries once. A `mock` provider means the app runs with no key. Swapping vendors is one file. |
| Background jobs | **A small Postgres-backed queue** (a `jobs` table, `FOR UPDATE SKIP LOCKED`, a worker started with `npm run worker`) | No extra service or account is needed, and it's easy to test. It sits behind `enqueue()` and `registerHandler()`, so it can move to Inngest or Trigger.dev later without touching play code. |
| Web search | **A pluggable `SearchProvider`**, recommended **Tavily** or **Brave Search API**, plus a `mock` provider with fixtures | Both are licensed search APIs with free dev tiers. **You pick one** (see §9). |
| Job boards | **Official public ATS job-board APIs**: Greenhouse Job Board API, Lever Postings API, Ashby public job board API | These are public, documented, and meant for reading postings. Search finds the companies (e.g. `site:boards.greenhouse.io "RevOps Manager"`), and the ATS API confirms the posting and gives a stable source URL. |
| Local businesses | **Google Places API (New)**, used after Phase 3 | Official API. It needs a Google Cloud key with billing, so it stays **off until you approve it**. |
| Email enrichment | `EmailProvider` interface + waterfall. **Two mock providers** in v1. | There are no paid keys in dev. Real providers (e.g. Hunter, Apollo, ZeroBounce) plug in later, with your approval. |
| HTML parsing | `cheerio` | Small and fast. No headless browser and no JS execution. |
| robots.txt | `robots-parser` | Tiny, well-known, correct. |
| Email sending | **None in v1.** "Approve" marks the email approved and offers Copy and "Open in mail app" (a mailto link). The user sends it from their own mailbox. An `EmailSender` interface exists with a `log` (no-op) implementation. | Real sending needs a provider such as the Gmail API, Resend or SES, plus domain authentication. That's a paid or keyed service, so I'll **ask first**. See §12. |
| Validation | `zod` | Shared schemas for forms, LLM outputs, and job payloads. |
| Tests | **Vitest** | Fast and TS-native. |
| CSV | Hand-written RFC 4180 serializer (~30 lines) | Not worth a dependency, and easy to unit-test (including CSV-injection escaping). |

**Dependencies needing your OK** (all free and open source unless noted):
`next react react-dom tailwindcss drizzle-orm drizzle-kit postgres @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod cheerio robots-parser vitest tsx`.
I'll avoid anything else large unless I ask first.

**Paid or keyed services needing your OK:** DeepSeek API (usage-billed; decided), one search API (free tier to start), and Google Places (billing account, later). Everything works with `*_PROVIDER=mock` until you add keys.

## 3. Architecture

```
Browser (Next.js pages, React Server Components)
   │  server actions / route handlers (auth-checked, workspace-scoped)
   ▼
Next.js server ──► Postgres (Supabase): app tables + jobs queue + credit ledger
   │                    ▲
   │ enqueue(job)       │ claim job (SKIP LOCKED), write leads, charge credits
   ▼                    │
Worker process (npm run worker) ── uses ──► lib/research  (safe fetcher, robots, search, ATS APIs)
                                     ├──► lib/llm       (llm.ts: anthropic | mock)
                                     ├──► lib/enrichment (waterfall over EmailProviders)
                                     └──► lib/credits    (estimate, charge — idempotent)
```

Main flows:

1. **Analyze site.** `POST /analyze {url}` creates a `site_analysis` job. The worker fetches up to ~6 same-domain pages (home, about, pricing, product, customers), each checked against robots.txt. It extracts the text, and the LLM returns a `CompanyProfile` (zod-validated). The **ICP parser** normalizes the result and rejects bad output: it clamps arrays, dedupes, maps industries and sizes to enums, and drops empty fields. The user edits the profile in a form.
2. **Recommend plays.** Rules come first, then the LLM. The ICP decides which play types fit, and the LLM fills in params (e.g. which roles signal buying intent). The output is 3–5 `plays` in status `draft`, each with a `credit_estimate`.
3. **Run a play.** The user approves the play. The server checks the balance against the estimate, sets status `queued`, and enqueues it. The worker then searches, confirms via official APIs, and extracts. It **grounds** each field, and anything not grounded becomes "not found". It inserts the leads, charges per lead actually found, and sets status `completed` (or `partial` or `failed`).
4. **Enrich.** This runs on the selected leads. The waterfall tries provider A, then provider B, and stops at the first `verified` result. Credits are charged only for found or verified results.
5. **Draft outreach.** The LLM writes a draft using **only** facts already on the lead row (fit_reason, sources). The server appends a fixed footer with the opt-out line and the sender's postal address. Suppressed leads are skipped and labeled.

6. **Sequence.** The user enrolls leads in a sequence. Enrollment checks that the lead has a named person, isn't suppressed, and fits the per-company cap. Step 1's task is due now. When a task is marked done, the next step becomes due at `completed_at + wait_days`. A daily job moves due steps into today's tasks, up to the sender's daily cap, and drafts each message at that time so the draft can use what's been learned.
7. **Reply logging.** No inbox is read in v1. The user clicks **Log reply** and records the reply text, objection type and outcome. Any logged reply stops the enrollment. An opt-out also adds the person's email to the suppression list and stops every enrollment for that person.

**Grounding check (anti-fabrication).** When the LLM extracts a company, person, or title from a fetched page, the value must appear in that page's text (normalized substring match). Otherwise it is dropped to `null`. The LLM prompt also says to return null rather than guess. The code check is the real guarantee.

**Prompt-injection posture.** Crawled page text goes into the LLM only as clearly delimited data. The LLM has **no tools with side effects**, and output is schema-validated. A malicious page can at worst produce a wrong field, and the grounding check catches most of those.

## 4. Data model (Drizzle, Postgres)

All app tables are scoped by `workspace_id`. Access goes through server code that checks membership. Row-level security (RLS) is enabled on every table as defense in depth, and server code uses the Supabase JWT user for its checks.

| Table | Key columns |
|---|---|
| `users` | `id` (= `auth.users.id`), `email`, `name`, `created_at` |
| `workspaces` | `id`, `name`, `plan` (`free`\|`pro`), `sender_name`, `sender_company`, `sender_postal_address`, `daily_send_cap` (default 25), `max_contacts_per_company` (default 2, allowed 1–2), `created_at` |
| `workspace_members` | `workspace_id`, `user_id`, `role` (`owner`\|`member`) |
| `company_profiles` | `id`, `workspace_id`, `site_url`, `summary`, `icp` (jsonb, zod-typed), `source_urls[]`, `status`, `updated_at` |
| `plays` | `id`, `workspace_id`, `company_profile_id`, `type` (`hiring_signal`\|`decision_makers`\|`local_business`), `title`, `rationale`, `params` (jsonb), `status` (`draft`\|`queued`\|`running`\|`completed`\|`partial`\|`failed`), `credit_estimate`, `credits_spent`, `row_limit`, `error`, timestamps |
| `leads` | `id`, `play_id`, `workspace_id`, `company`, `company_domain`, `person`, `title`, `email`, `email_status` (`unknown`\|`not_found`\|`unverified`\|`verified`\|`suppressed`), `email_provider`, `source_urls text[] NOT NULL CHECK (cardinality >= 1)`, `fit_reason`, `signal` (jsonb, e.g. job posting), `belief_stage` (the highest stage confirmed by a logged reply, default `problem_awareness`), `created_at`. Unique on (`play_id`, `company_domain`, `person`) for dedupe. |
| `credit_ledger` | `id`, `workspace_id`, `delta` (int, + grant / − spend), `reason`, `action` (`search_result`\|`enrich_found`\|`verify`\|`grant`\|…), `ref_type`, `ref_id`, `idempotency_key UNIQUE`, `created_at` |
| `outreach_drafts` | `id`, `lead_id`, `workspace_id`, `task_id` (nullable), `channel` (`email`\|`linkedin_connect`\|`linkedin_message`), `subject`, `body`, `belief_stage`, `new_value` (jsonb: `{type: angle\|proof\|resource, detail}`, required on follow-ups), `status` (`draft`\|`blocked`\|`approved`\|`sent_manually`\|`discarded`), `block_reasons[]`, `model`, timestamps |
| `sequences` | `id`, `workspace_id`, `name`, `is_default` |
| `sequence_steps` | `id`, `sequence_id`, `position`, `channel`, `wait_days` (int ≥ 0; default 0 for step 1 and 7 for later steps), `intent` (e.g. "first touch", "proof", "breakup") |
| `sequence_enrollments` | `id`, `sequence_id`, `lead_id`, `workspace_id`, `owner_user_id`, `status` (`active`\|`stopped`\|`completed`), `stop_reason` (`replied`\|`opted_out`\|`suppressed`\|`manual`), `current_position`, `next_due_at`, timestamps |
| `tasks` | `id`, `enrollment_id`, `step_id`, `lead_id`, `owner_user_id`, `channel`, `due_at`, `status` (`pending`\|`done`\|`skipped`\|`cancelled`), `completed_at` |
| `lead_replies` | `id`, `lead_id`, `enrollment_id`, `channel`, `reply_text`, `objection_type` (`authority`\|`no_need`\|`status_quo`\|`timing`\|`price_value`\|`no_budget`\|`trial_request`\|`solution_specific`\|`competitor`\|`other`\|null), `outcome` (`positive`\|`neutral`\|`negative`\|`meeting_booked`\|`opt_out`\|`wrong_person`\|`bounced`), `logged_by`, `created_at` |
| `suppression_list` | `id`, `workspace_id`, `email` (nullable), `domain` (nullable), `reason`, `created_at`. Exactly one of email or domain is set. |
| `jobs` | `id`, `type`, `payload` jsonb, `status`, `attempts`, `run_after`, `locked_at`, `last_error`, timestamps |

The balance is `SUM(delta)` over a workspace's ledger, computed inside a transaction that holds a row lock on `workspaces`. Every charge has a deterministic `idempotency_key` (e.g. `lead:{id}:search_result`). A retried job therefore can't double-charge.

## 5. Credits

- **One config file:** `src/config/credits.ts` holds per-action costs (`search_result`, `enrich_found`, `verify`, `draft`), plan limits (`free: { rowsPerTable: 30, export: false }`), and the signup grant.
- **Estimate** = `min(row_limit, plan.rowsPerTable) × costPerRow` for the play type. It is shown as **"up to N credits"** before approval.
- **Charge only for what's found.** Searches that return nothing cost 0. A lead is charged when it's inserted, an email when one is found, a verification when the result is verified.
- **Never go negative.** The run stops early (status `partial`) when the balance can't cover the next row.
- **Free tier:** at most 30 rows per leads table, CSV export disabled (the button shows an upgrade notice), and a starting grant of credits. **No billing in v1.** `plan` is set by the seed script or SQL.
- Tests cover the estimate math, charge idempotency, the no-negative guard, plan limits, and the export gate.

## 5a. Outreach rules (sequences, messaging, limits)

All of these rules live in `src/config/outreach.ts` and are enforced in `src/lib/outreach/validators.ts` and `src/lib/sequences/`. Each one is a pure function with unit tests.

**Belief stages**, in order: `problem_awareness`, `problem_prioritization`, `solution_preference`, `commercial_agreement`, `championship`.
- Each draft is tagged with a stage. A cold first touch must be `problem_awareness` or `problem_prioritization`.
- A draft may target at most one stage above the lead's confirmed stage. A lead only moves up when the user logs a reply that shows it. So nobody gets a solution pitch until they've shown the problem is a priority.
- The LLM prompt says to lead with the problem, not the product. The stage rule is the hard check.

**Draft checks.** A draft that fails a check is saved as `blocked` with its reasons shown. The user can edit it or regenerate it, but can't approve it.
- **Short.** Emails are at most about 120 words of body, not counting the footer. LinkedIn connect notes are at most about 300 characters. Both limits are configurable.
- **One ask.** Exactly one question to the reader. Time-commitment asks are rejected: "30 minutes", "15-min call", calendar links, "hop on a call".
- **No "just checking in".** A follow-up fails if any of these hold:
  - It has no `new_value` (angle, proof or resource).
  - The `new_value` detail isn't reflected in the body.
  - It matches the nudge-phrase list: "just checking in", "circling back", "bumping this", "following up on my last", "any update", "did you see my".
  - Its word overlap with earlier steps' bodies is above the threshold.

**Sequence timing.** The default sequence is step 1, a LinkedIn connect or message due now, then step 2, an email due 7 days after step 1 is marked done.
- Each step has its own `wait_days`.
- Dates are computed in the workspace's timezone at day level, so "7 days" means the same clock day a week later.
- Stop conditions are checked before any task is created or shown: a reply was logged, the person opted out, or the person is suppressed. When an enrollment stops, its open tasks are cancelled.

**LinkedIn steps are manual-only.** BeaconRadar never fetches, automates or logs in to LinkedIn. The task shows the drafted text, a Copy button, and a plain LinkedIn search link built from the person's name and company. The user opens that link themselves. Leads without a named person can't be enrolled and show "needs a contact".

**Limits.**
- **Per-company cap.** Enrollment is rejected once a company has `max_contacts_per_company` people in active or completed enrollments. Companies are matched by `company_domain`.
- **Daily send cap.** Each sender's count of LinkedIn tasks marked done plus emails approved today is capped at `daily_send_cap`. Today's tasks shows the remaining capacity, and overflow tasks roll to the next day.

**Learning dashboard.** It shows prospects contacted (enrollments with at least one completed step), replies, positive replies and meetings booked, for all time and for the current cohort.
- A progress bar tracks the 30–50 qualified prospects target.
- Breakdowns cover play type, belief stage, step number, channel and objection type.
- There is **no open-rate metric** and no tracking pixels.

## 6. Compliance (CAN-SPAM / GDPR-friendly; not legal advice)

- No auto-send in v1.
- A fixed footer goes on **every** draft: an opt-out sentence and the sender's postal address, which CAN-SPAM requires. The postal address is collected in workspace settings. Drafts are blocked until it's set.
- **Suppression list** by email or domain. It applies at draft time and at export time, and suppressed rows are labeled. Users can add entries by hand or paste them in bulk.
- Opt-outs from any channel are logged with **Log reply** using outcome `opt_out`. That adds the email (or the lead, if there's no email) to the suppression list and stops every enrollment for the person.
- LinkedIn messages are sent by the user by hand. BeaconRadar never automates LinkedIn, which their terms prohibit.
- Only business contact data is stored. Users can delete a lead or a whole play. Every lead has source URLs (provenance) to support data-subject requests.
- The fetcher identifies itself (`BeaconRadarBot/0.1 (+contact URL)`), obeys robots.txt, rate-limits per host, enforces a domain denylist (linkedin.com, facebook.com, etc.), and never logs in or runs page JS.

## 7. Folder layout

```
.
├── PLAN.md  DECISIONS.md  README.md  .env.example
├── docs/founding-sales-notes.md
├── drizzle.config.ts
├── supabase/                    # supabase CLI config (local stack)
├── drizzle/                     # generated SQL migrations
├── scripts/
│   ├── worker.ts                # job worker entry (npm run worker)
│   └── seed.ts                  # demo workspace, profile, plays, leads
├── src/
│   ├── app/
│   │   ├── page.tsx             # landing + domain input
│   │   ├── login/               # magic link
│   │   ├── auth/callback/       # supabase auth callback
│   │   └── (app)/               # authed area
│   │       ├── profile/         # view/edit company profile + ICP
│   │       ├── plays/           # recommendations, approve, status
│   │       ├── plays/[id]/      # leads table, enrich, export
│   │       ├── drafts/          # outreach review
│   │       ├── sequences/       # sequence editor + enrollments
│   │       ├── tasks/           # "today's tasks" queue
│   │       ├── dashboard/       # learning-loop metrics
│   │       └── settings/        # sender info, suppression list, credits ledger
│   ├── config/{credits.ts,outreach.ts}
│   ├── lib/
│   │   ├── db/{schema.ts,client.ts}
│   │   ├── auth/                # supabase server/client helpers, requireWorkspace()
│   │   ├── llm/llm.ts           # the single LLM wrapper (+ mock)
│   │   ├── jobs/{queue.ts,handlers.ts}
│   │   ├── research/
│   │   │   ├── fetcher.ts       # SSRF-safe fetch, robots, rate limit, denylist
│   │   │   ├── extract.ts       # html → text (cheerio)
│   │   │   ├── search/{types.ts,tavily.ts,brave.ts,mock.ts}
│   │   │   └── ats/{greenhouse.ts,lever.ts,ashby.ts}
│   │   ├── profile/{analyzer.ts,icp.ts}   # icp.ts = ICP parser
│   │   ├── plays/{registry.ts,recommend.ts,hiring.ts}
│   │   ├── credits/{ledger.ts,estimate.ts}
│   │   ├── enrichment/{types.ts,waterfall.ts,providers/mockA.ts,providers/mockB.ts}
│   │   ├── outreach/{draft.ts,footer.ts,suppression.ts,validators.ts,stages.ts}
│   │   ├── sequences/{timing.ts,enroll.ts,tasks.ts,stop.ts,limits.ts}
│   │   ├── replies/{log.ts,metrics.ts}
│   │   └── csv.ts
│   └── components/
└── tests/  (unit tests colocated as *.test.ts; fixtures in tests/fixtures)
```

## 8. Environment variables (`.env.example`)

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRAWLER_CONTACT_URL=http://localhost:3000/bot     # shown in User-Agent

# Supabase (values printed by `supabase start`; ports 55321-55324 to avoid clashing with other local projects)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=                              # server/worker only
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres

# LLM
LLM_PROVIDER=deepseek                             # mock | deepseek | anthropic
LLM_MODEL=deepseek-flash                          # optional; provider default if empty
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
ANTHROPIC_API_KEY=

# Research
SEARCH_PROVIDER=mock                              # mock | tavily | brave
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=
GOOGLE_PLACES_API_KEY=                            # later, needs approval

# Enrichment
ENRICHMENT_PROVIDERS=mockA,mockB                  # waterfall order
```

## 9. Phases and done-when

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Scaffold, Supabase Auth, Drizzle schema + migration, landing page with domain input | You can sign in locally, the tables exist, and the domain input validates and saves. |
| 2 | Site analyzer + ICP parser + edit UI | Entering a URL produces an editable profile with sources (mock or real LLM). The ICP parser is tested. |
| 3 | Plays recommender + **hiring-signal play** end to end | Approving a play runs the job and fills real leads from ATS APIs, each with a posting URL. |
| 4 | Leads table, source links, CSV export (plan-gated), credits ledger UI | Balance and ledger are visible, charges match found rows, and credit logic is tested. |
| 5 | Enrichment waterfall + 2 mock providers | Waterfall order and stop-at-verified are tested. Mock emails use a reserved `.example` domain. |
| 6 | Outreach drafting with belief-stage tags + draft checks + review UI + suppression list | Every email has the footer, suppressed leads are skipped, and blocked drafts show their reasons. The "just checking in" rejection is tested. |
| 7 | Sequences + today's tasks + limits | The default and custom sequences run, Copy and Mark done work, and Approve gates emails. Tests cover timing (the 7-day default and custom waits), stopping on reply or opt-out, the per-company cap and the daily cap. |
| 8 | Reply and objection logging + learning dashboard | Logging a reply stops the sequence, and the dashboard shows contacted, replies, positive and meetings with breakdowns. |
| 9 | Tests, README, .env.example, seed script | `npm test` is green, and `npm run seed` gives a working demo with no keys, including a sequence and some logged replies. |

After each phase: a short summary, small commits, and I stop for your review.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **SSRF.** User-supplied URLs could make us fetch internal addresses. | Only http/https. Resolve DNS and block private, loopback, link-local, and metadata IPs, re-checking on every redirect. Cap redirects, size (~2 MB), and time (10 s). |
| **LLM fabrication** of people, emails, or facts | A code grounding check against the source text, null becomes "not found", schema-validated outputs, and source URLs required by a DB constraint. |
| **Prompt injection** from crawled pages | Content is delimited as data, the LLM has no side-effect tools, and output passes the schema plus grounding check. |
| **Terms of service and robots.txt** | Official APIs first, robots-checked fetches, a denylist (LinkedIn etc.), per-host rate limits, no login walls. |
| Few or no "decision-maker" names without LinkedIn | Use the companies' own team/about pages and press pages when robots allows, otherwise "not found". Enrichment providers fill the gap later. **Expect sparse person data in v1.** |
| Search and LLM costs | Mock providers by default, per-run caps, row limits, and logged token usage per job. |
| Credit race conditions or double-charging | Row lock on the workspace during a charge, a unique idempotency key on each ledger entry, and tests. |
| Long jobs on serverless hosting | A separate worker process now. The queue interface allows Inngest or Trigger.dev later. Hosting is out of scope for the MVP. |
| Compliance gaps | Footer + postal address enforced, suppression list, no sending, deletion paths. A legal review is still needed before real outreach. |
| LinkedIn terms of service | Manual-only steps. No fetching, automation or browser extension. The only LinkedIn link is a search URL the user opens. |
| Draft checks block good drafts or pass weak ones | Every block shows its reason and the user can edit. Thresholds live in config. Phrase lists are tested both ways. |
| Replies are logged by hand, so the data depends on the user | Log reply sits one click away on every task and lead, and the dashboard flags enrollments with no update after their last step. Inbox sync is a later feature. |
| "Belief ladder" isn't from the cited book | It's documented as BeaconRadar's own rule (see `docs/founding-sales-notes.md`), so nobody mistakes it for Kazanjy's guidance. |
| ATS coverage bias (Greenhouse/Lever/Ashby skew toward tech companies) | Fine for a B2B tech ICP. Other job sources can be added behind the same interface. |

## 11. Out of scope for v1

Automated email sending (pending §12 item 5), any LinkedIn automation, inbox or reply sync, open/click tracking, billing/Stripe, team invites UI, CRM sync, LinkedIn anything, headless-browser scraping, production deployment.

## 12. Decisions I need from you

1. **Approve the stack and dependency list** in §2 (Supabase local + Drizzle + Postgres queue + Anthropic).
2. **Search provider:** Tavily or Brave? Mock is used until a key is added.
3. ~~Anthropic API as the LLM~~ Decided: **DeepSeek** (see §2).
4. ~~App name~~ Decided: **BeaconRadar**.
5. **Email "Approve".** I've built it as approve, then copy or open in your mail app, with no provider. Do you want real sending from the app in v1? If so, which provider: Gmail API, Resend or SES? That adds a keyed service and domain setup.
6. **Belief stages.** Keep your 5 stages as BeaconRadar's own rule, given that they aren't from *Founding Sales*?
