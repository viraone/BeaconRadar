# Founding Sales: notes for BeaconRadar's outreach features

Source: Pete Kazanjy, *Founding Sales*, free online text at https://foundingsales.com (read 2026-10-13).
Chapters read: 2 (Product Marketing), 4 (Prospecting), 5 (Outreach), 7 (Pitching), 8 (Closing). Chapters 1, 3, 6 and 9–13 were not read.
Everything below is paraphrased. The pages were read through an automated page reader, so spot-check any figure against the chapter before quoting it outside the team.

## Prospecting (Ch. 4)
- The ICP describes an **organization**, not a person. It combines must-have traits with **demand signals** that show how much pain there is, such as team size, **hiring volume**, and spend on related tools. Some traits can only be learned in discovery.
- Choose prospects by need, not convenience. Selling to friends who lack the pain wastes runway and creates churn.
- Start the first list at **50–100 accounts** that have the pain. Build it by hand from **one primary source at a time**, and avoid bought lists.
- Rank accounts by apparent pain. Favor mid-sized "deer" over tiny "rabbits" and slow "elephants". Local geography helps.
- Job postings are explicitly named as a demand signal. This supports making the hiring play the first play we build.
- Per account, capture a **cascade** of contacts: the decision-maker plus complementary people. Note warm-intro paths too. Contact data goes stale, so plan to refresh it.

## Messaging (Ch. 2, 5, 7)
- The narrative runs in this order: the problem, who has it, what it costs, how it's solved today and why that fails, what changed, how the new solution works, proof, then price (Ch. 2).
- **Lead with the problem.** If the prospect rejects the problem, the conversation can end early with no time wasted (Ch. 2). Without confirmed pain, a pitch is useless, so disqualify politely (Ch. 7).
- Emails should be **short, one thought each**, plain text, calm and peer-to-peer. No exclamation points, hype or HTML (Ch. 5).
- Personalize with the prospect's demand signals plus a hand-written opening line. The chapter cites roughly double the reply rate for customized first emails over generic ones (Ch. 5, citing Outreach data).
- The book's ask is a **short meeting (about 10–30 minutes) within about a week** (Ch. 5).

## Follow-up (Ch. 5)
- Use a multi-touch cadence that alternates **email and phone**. The example covers about a week: email and call on day 1, calls on days 2–3, email on day 5, a "breakup" email on day 7.
- Reply in the same thread so the first personalized note stays visible.
- **Every follow-up adds something new**, such as a short video, a metric, or a different pain. Never send a bare "just following up". The breakup email says you'll stop writing but still think the topic matters.
- Follow-ups matter. In the cited data, the 2nd email drew the most replies, and rates held up through about the 5th email before dropping.

## Learning loop (Ch. 7, 8)
- Keep a living document of objections and your answers. Recurring objections earn a slide (Ch. 7).
- Generic objection types: authority, no need, happy with the status quo, timing, price/value, no budget, trial or reference requests. There are also solution-specific and competitor objections (Ch. 7). **BeaconRadar's `objection_type` list will use these.**
- Record why deals are lost, and review the unqualified ones to fix targeting. Each pipeline stage needs a clear definition and a dated next step (Ch. 8).

## Where BeaconRadar's spec differs from the book
| Spec item | What the book says | Status |
|---|---|---|
| "Belief ladder" with 5 stages (problem awareness through championship) | **Not found** in Ch. 2, 5, 7 or 8. The closest ideas are Ch. 2's gate order (accept the problem, have it, see the cost, see current fixes fail, see something new) and Ch. 7's persuasion formula, which has a "belief" factor. A web search credits "belief ladder" to Cole Gordon, whose version lists 7 different beliefs. | **Unverified** as Kazanjy's. We implement your 5 stages as BeaconRadar's own rule. |
| LinkedIn step first | LinkedIn is used for research, title search and referral paths, not as an outreach step. The core channels are email and phone (Ch. 4, 5). | Your choice. Steps are manual tasks. |
| Ask for a yes/no answer, not a meeting | The book asks for a 10–30 minute meeting (Ch. 5). | Your choice. Drafts use a yes/no ask. |
| 7-day wait before the follow-up | The book's cadence is denser, about 5 touches in 7 days (Ch. 5). | Your choice. The wait can be set per step. |
| 1–2 contacts per company | The book suggests a cascade of several contacts per account (Ch. 4). | Your choice. The cap is set in config. |
| 20–30 sends per day | No daily number is given (Ch. 5). | Your rule. |
| No open-rate metric | The book uses opens and clicks as interest signals (Ch. 5). | Your choice. It matches replies-first judging, and BeaconRadar adds no tracking pixels. |
| Run 30–50 prospects, then review | The book's first list is 50–100 accounts (Ch. 4). | Compatible. |
