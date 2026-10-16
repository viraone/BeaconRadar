# BeaconRadar

AI lead generation with a human at every step. Enter your website; BeaconRadar reads it, drafts your ideal customer profile, suggests one-click "plays" that find real companies from licensed sources, enriches work emails through a provider waterfall, writes problem-first outreach, and runs it as a task queue you work through by hand. Every lead cites its source. Nothing is ever sent by the app.

Built for founder-led sales. The outreach rules follow Pete Kazanjy's *Founding Sales* (see `docs/founding-sales-notes.md`): lead with the problem, one yes/no ask, follow-ups must add something new, judge by replies.

## What it does, end to end

| Step | Page | What happens |
|---|---|---|
| 1. Analyze | `/profile` | Fetches a few public pages (robots.txt respected), asks the LLM for a company profile and ICP. You edit it. |
| 2. Recommend | `/plays` | 3–5 plays from the ICP. Each shows "up to N credits" before you approve. |
| 3. Run a play | `/plays/[id]` | **Hiring signal** (built): search finds job-board URLs, the official Greenhouse/Lever/Ashby APIs confirm the posting, one lead per company with the posting as source. Decision-makers and local-business plays are placeholders. |
| 4. Enrich | `/plays/[id]` | Provider waterfall (stop at first verified). Two mock providers ship; real ones plug in as one file each. |
| 5. Draft | `/drafts` | Problem-first messages tagged with a belief-ladder stage, checked in code (length, one ask, no time asks, no "just checking in", footer with opt-out). Copy, edit, approve, open in mail app. |
| 6. Sequence | `/sequences`, `/tasks` | LinkedIn note now, email 7 days after it's marked done (editable). Today's tasks with Copy, Find on LinkedIn, Mark done. Stops on reply or opt-out. Caps: 1–2 contacts per company, N sends per day. |
| 7. Learn | `/dashboard` | Log every reply and objection. Contacted, replies, positive, meetings; breakdowns by play, channel, step, stage, objection. No open rate. |

Credits: every action has a cost in `src/config/credits.ts`, charged only for results actually found, never below zero, idempotent on retry. Free plan: 30 rows per table, no CSV export. No billing yet; plans are set by hand.

## Run it locally

Requirements: Node 20+, npm, Docker Desktop, the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
cp .env.example .env.local        # then paste the two keys printed by the next command
npm run supabase:start            # local Postgres + Auth + Mailpit on ports 55321-55324
npm run db:migrate                # create the tables
npm run seed                      # demo workspace for demo@beaconradar.example (no keys needed)
npm run dev                       # http://localhost:3000  (use `npm run dev -- -p 3200` if 3000 is taken)
```

Sign in with `demo@beaconradar.example`; the magic link lands in the local inbox at http://127.0.0.1:55324. Supabase Studio is at http://127.0.0.1:55323. `npm run seed -- you@example.com` seeds a workspace for your own address instead.

### Keys (all optional)

| Variable | Needed for | Without it |
|---|---|---|
| `DEEPSEEK_API_KEY` + `LLM_PROVIDER=deepseek` | Real site analysis, recommendations and drafts | `LLM_PROVIDER=mock` echoes site text and uses templated drafts |
| `TAVILY_API_KEY` + `SEARCH_PROVIDER=tavily` (or Brave) | Real job-board discovery | Fixture boards labeled MOCK |
| real enrichment providers | Real work emails | `mockA,mockB` return `.example` addresses labeled mock |

`.env.local` is git-ignored. Never paste keys into chat or commits.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm test` | Vitest: unit tests plus integration tests (the latter skip when `DATABASE_URL` is unreachable) |
| `npm run typecheck`, `npm run lint` | `tsc --noEmit`, ESLint |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations from `src/lib/db/schema.ts` |
| `npm run supabase:start` / `supabase:stop` | Local Supabase stack |
| `npm run seed [-- email]` | Demo workspace (re-runnable) |
| `npm run worker` | Background job worker (required in production; optional locally with `JOBS_INLINE=true`) |
| `scripts/smoke-*.ts` | Dev checks that exercise plays, enrichment, drafts, sequences and replies against the local DB: `npx tsx --env-file=.env.local scripts/smoke-plays.ts <profileId>` etc. |

## Architecture

- **Next.js 16** (App Router, cache components) + TypeScript + Tailwind. Server Actions for mutations; route handlers for CSV exports and auth callbacks.
- **Postgres via Supabase** (local Docker; the same schema runs on hosted Supabase). **Drizzle** schema in `src/lib/db/schema.ts`, migrations in `drizzle/`. RLS is enabled on every table with no policies: all access goes through server code that checks workspace membership.
- **Supabase Auth** magic links through `@supabase/ssr`; `src/proxy.ts` refreshes the session.
- **LLM** behind one file, `src/lib/llm/llm.ts`: DeepSeek (OpenAI-compatible JSON mode, schema in the prompt, zod validation, one retry), Anthropic, or mock. Only structured JSON output is exposed.
- **Research**: `src/lib/research/fetcher.ts` (SSRF-safe, robots.txt, denylist, caps), search providers, job-board API clients.
- **Jobs**: a Postgres table with `FOR UPDATE SKIP LOCKED` claims and exponential backoff (`src/lib/jobs/`). Dev runs jobs inline after the response; production runs `npm run worker`.
- **Rules in code**: credits (`src/lib/credits`), draft checks (`src/lib/outreach/validators.ts`), sequence timing and caps (`src/lib/sequences`), reply side effects (`src/lib/replies/log.ts`).

`PLAN.md` has the full design and `DECISIONS.md` the log of every judgment call (76 so far).

## Rules this codebase follows

- No secrets in git. `.env.example` lists every variable with blanks.
- Every lead has at least one source URL (database constraint). Unknown facts are stored as null and shown as "not found". The model's company name must appear on the fetched pages or it is dropped.
- Official APIs and robots.txt-respecting fetches only. LinkedIn and other scraping-prohibited sites are denied before any request. LinkedIn steps are manual: the app shows the note and a search link, you do the rest.
- Nothing is sent automatically. Emails are drafts until you approve them and send from your own mailbox. Every email carries your name, postal address and an opt-out line; the suppression list applies to drafting, enrollment and export.
- Replies are logged by hand. Any reply stops the sequence; an opt-out suppresses the person.

## Deploying (not done yet)

1. Create a hosted Supabase project; put its URL, publishable key, secret key and `DATABASE_URL` in the host's env; run `npm run db:migrate` against it.
2. Set `JOBS_INLINE=false` and run `npm run worker` as a separate long-lived process.
3. Set `NEXT_PUBLIC_APP_URL` to the public URL and add `https://<host>/**` to Supabase Auth's redirect URLs; copy `supabase/templates/magic_link.html` into the hosted project's email templates.
4. Add real keys: DeepSeek, a search provider, and enrichment providers (each is one adapter file under `src/lib/enrichment/providers/`).

## Known gaps

- Tavily and Brave clients are written to their current docs but have not been exercised with a live key.
- Decision-makers and local-business plays are placeholders; Google Places needs a billing account.
- Enrichment has mock providers only. Real ones need paid keys.
- No billing or plan upgrade flow; no inbox sync (replies are logged by hand); time zone is a per-workspace column without a settings control yet.
