# Origami

AI lead generation, reviewed by a human at every step. Enter your website, get an editable ideal-customer profile, run "plays" that find real companies and people from licensed sources (every row cites its source), enrich emails, and review every outreach message before anything goes out.

See `PLAN.md` for the architecture and phases, `DECISIONS.md` for the choices made along the way, and `docs/founding-sales-notes.md` for the sales reasoning behind the outreach features.

## Local development

Requirements: Node 20+, npm, Docker Desktop, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
cp .env.example .env.local        # then paste the keys printed by the next command
npm run supabase:start            # local Postgres + Auth + Mailpit in Docker
npm run db:migrate                # create the tables
npm run dev                       # http://localhost:3000
```

`supabase start` prints `PUBLISHABLE_KEY` and `SECRET_KEY`. Put them in `.env.local` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The local stack uses ports 55321 to 55324 so it does not collide with other Supabase projects.

Sign-in emails go to the local Mailpit inbox at http://127.0.0.1:55324. Supabase Studio is at http://127.0.0.1:55323.

No API keys are needed to develop: set `LLM_PROVIDER=mock` and the search and enrichment providers default to `mock`.

For real analysis the project uses **DeepSeek**: set `LLM_PROVIDER=deepseek` and paste your key into `DEEPSEEK_API_KEY` in `.env.local`. The default model is `deepseek-flash`; set `LLM_MODEL=deepseek-v4-pro` for the stronger model. Anthropic is also wired up (`LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations in `drizzle/` |
| `npm run db:studio` | Drizzle Studio |
| `npm run supabase:start` / `supabase:stop` | Local Supabase stack |
| `npm run worker` | Background job worker (Phase 3) |
| `npm run seed` | Demo data (Phase 9) |

## Rules this codebase follows

- No secrets in git. `.env.local` is ignored; `.env.example` lists every variable.
- Every lead has at least one source URL (database constraint). Unknown facts are stored as null and shown as "not found".
- Official APIs and robots.txt-respecting fetches only. No LinkedIn automation.
- Nothing is sent automatically. Emails are drafts until approved; LinkedIn steps are manual tasks.
