# La Pelota: the in-product assistant

Written 2026-11-17 as a build handoff. Revised the same day with Juan's answers, then again with the provider (Fireworks) and the two-model setup. Not built yet. Read `claude/roadmap.md` and `claude/missing-checklist.md` first; this doc assumes the repo state they describe (`juanpasaflipz/pelotaz`, main at or after `ff2bd4e`).

"La Pelota" is a working name.

## What it is

An assistant inside Pelotaz that the business owner can ask about their own marketing, and that offers suggestions without being asked. It runs on two open-weight models that split the work.

Three jobs, one set of tools:

1. **Chat.** The owner asks in plain Spanish ("¿qué me funcionó esta semana?", "¿por qué bajó el martes?", "¿qué publico mañana?") and gets a short answer built from their own data.
2. **Weekly insights.** A scheduled pass that writes three suggestions per brand into the dashboard every Monday.
3. **Propose a post.** When the owner agrees, it puts a draft into the review queue. It never publishes, approves, edits live posts or spends money.

## Questions and answers

Answered by Juan on 2026-11-17 unless marked "proposed".

| Question | Answer |
| --- | --- |
| Which plans get it? | Starter includes it. Pro gets a higher cap. |
| What are the caps? | Not fixed. Start from the numbers in "Caps" below, measure, adjust, repeat. |
| Read-only, or can it act? | It can propose a post into the review queue. Nothing else. |
| When does it go public? | Build and test privately first. No public release until testing is done. |
| When does `/privacidad` change? | After Meta approves the App Review, not before. |
| Which inference provider? | Fireworks AI, for the eval and for production. Juan opens the account. |
| Which model? | Two: DeepSeek-V4.1-Flash and GLM-5, working together as described in "Two models". The eval confirms the setup and picks the exact GLM version. |
| Is it in the free beta? | Proposed: yes, for approved beta testers, once private testing passes. Their usage is the data that sets the caps. |
| Name and character? | Proposed: "La Pelota", the red ball as avatar. Juan confirms before the UI ships. |
| What is the "modelo de IA superior" add-on? | Proposed: every chat answer comes from the strong model, not only escalations. Price set after the eval shows the cost difference. |

## Provider: Fireworks AI

An independent US company (not part of Google), with an OpenAI-compatible API. Both models sit behind one key.

Prices per million tokens, from third-party trackers in October and November 2026. **Confirm every price, model ID and hosting region on Fireworks' own site on build day**, and record them in `claude/decisions.md`.

| Model on Fireworks | Input / output | Cached input | Model ID as listed |
| --- | --- | --- | --- |
| DeepSeek-V4.1-Flash | $0.22 / $0.66 | $0.007 | `accounts/fireworks/models/deepseek-v4p1-flash` |
| DeepSeek-V4.1-Flash, US endpoint | $0.45 / $1.80 | Check | Check |
| GLM-5.2 | $1.40 / $4.40 | $0.14 | `accounts/fireworks/models/glm-5p2` |
| GLM-5.3 | $1.40 / $4.40 | Check | Check |
| GLM-5.3-Flash | from $0.15 input | Check | Check |

Things to settle on build day:

- **Region.** Trackers list a separate, pricier "US" endpoint for DeepSeek-V4.1-Flash, which suggests the standard endpoint is not guaranteed to run in the United States. Pelotaz declared US processors to Meta, so find out where each endpoint runs and use the US one if the standard one is not US-only. Do the same for GLM.
- **GLM version.** GLM-5.3 is reported as Z.ai's flagship since August 2026 at the same price as 5.2. Confirm its weights are open and its licence, then let the eval choose between 5.2 and 5.3.
- **Data use.** Find where Fireworks states it does not train on API data, and record the link.

Rules:

- Do not call Z.ai's or DeepSeek's own APIs.
- Nothing about the provider is hard-coded, so moving to another host (DeepInfra and Together AI serve both models) is a change of base URL, key and model IDs.

## Two models

They split the work; they do not debate every answer. A debate doubles cost and waiting time, and the job a second model would do there (catching wrong numbers and prices) is already done by the code checks.

| Role | Model | Used for |
| --- | --- | --- |
| **Fast** | DeepSeek-V4.1-Flash | The first attempt at every chat answer |
| **Strong** | GLM-5 (5.2 or 5.3) | Escalations, post proposals, weekly insights |

1. **Fast answers first.** Every chat question goes to the fast model with the tools.
2. **Strong takes over on failure.** If the answer fails a code check (ungrounded number, wrong price, wrong or missing tool call), the retry goes to the strong model with the same tool results. If that also fails, the owner gets "No tengo ese dato todavía". One escalation at most per message.
3. **Strong writes what gets published.** `propose_post` drafts come from the strong model.
4. **Real collaboration on weekly insights.** The fast model drafts candidate insights from the tool results; the strong model critiques them against the same evidence, drops weak ones, rewrites the rest and picks three. This runs once a week per brand, so the extra cost is small.
5. **Skip the fast model when it is the wrong tool.** If the eval shows a type of question the fast model fails most of the time, route that type straight to the strong model with a rule in code, not a model call.

Why: most messages cost fast-model prices, so the same budget buys more messages, and the strong model's quality goes where it matters.

Every message records which model answered and whether it was an escalation, so the escalation rate is visible in `/admin/asistente`. An escalation rate above roughly 25% means the fast model is not earning its place; rerun the eval.

## Architecture

### Provider layer

- One module, for example `src/lib/assistant/provider.ts`, exposing a single `chat({ role, messages, tools })` call, where `role` is `fast` or `strong`. If the repo already has a model client for the planner and drafts, extend that pattern instead of adding a second one.
- Environment variables: `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY`, `ASSISTANT_MODEL_FAST`, `ASSISTANT_MODEL_STRONG`.
- A setting `ASSISTANT_MODE` with values `routed` (default), `fast_only` and `strong_only`, so the eval and production can compare setups without code changes.
- Keep the system prompt and tool definitions byte-identical between calls so the provider's prompt cache applies.
- Streaming responses to the UI. An escalated answer replaces the first one before the owner sees a failed attempt: hold the stream until the checks pass.
- Timeouts and one retry. If the provider is down, the chat says so in Spanish; it never falls back silently to another vendor.

### Private testing gate

Nothing here is reachable by the public until Juan says so.

- `ASSISTANT_ENABLED` (off by default in Production) plus a per-tenant allowlist, `ASSISTANT_TENANTS`. With the flag off, the API route returns 404 and the UI renders nothing.
- **Stage 1, fixtures.** PR 1's eval runs on invented fixture data only. No real tenant data leaves Neon.
- **Stage 2, Juanberto's.** Allowlist Juan's own tenant. He is the data owner, so this is his own data going to the provider.
- **Stage 3, beta testers.** Only after: Meta App Review is approved, `/privacidad` names Fireworks, and Meta's data-processor declaration is updated if it needs to be. No outside business's data reaches the provider before all three.
- No mention of the assistant on the public page until Stage 3. Add its module chip then.
- **Do not change the Meta app settings or `/privacidad` while the App Review is open.**

### Read tools

Rules for every tool:

- The tenant and brand come from the session, never from the model's arguments.
- Queries run under the existing row-level security, with the same tenant context as the rest of the app.
- Results are capped (rows and date range) and returned as compact JSON with units and currency stated.
- Every call is logged with tenant, tool name, arguments and row count.
- All arithmetic (totals, percentages, differences, rankings) is done inside the tools. The model does not do maths.

v1 tools, on data that exists today:

| Tool | Returns |
| --- | --- |
| `get_brand_profile` | Brand DNA: offers, prices, tone, hours |
| `get_weekly_plan` | This week's or a given week's plan, with each post's reason |
| `list_posts` | Published and pending posts for a date range, with status |
| `get_post_results` | Reach, views and interactions per post, from the daily Meta results |
| `get_top_posts` | Posts ranked by a chosen metric over a range |
| `get_rejections` | Owner rejection reasons (`content_items.decision_note`) |
| `compare_periods` | The same metrics for two ranges, with the difference computed in code |

Added when their sprint lands:

| Tool | Depends on |
| --- | --- |
| `get_sales_summary`, `get_item_sales`, `get_weakest_daypart` | Sprint 1 (`sales_daily`, `sales_items_daily`) |
| `get_lift_estimates` | Sprint 2 |
| `get_google_score`, `get_reviews_summary` | Sprint 4 and `claude/seo-module.md` |

### The one write tool: `propose_post`

- The assistant first describes the post in chat and asks "¿Lo mando a tu revisión?". The tool runs only after the owner taps or types yes. That confirmation is checked in code (a confirmed-proposal ID from the UI), not left to the model.
- The draft is written by the strong model.
- It creates a normal draft in the review queue through the same code path the planner's drafts use, marked `source = assistant`, with the reason it gave.
- The draft passes every existing check: fact and price check against Brand DNA, the rewrite-once loop, and the merge gate against repeated lines. A draft that fails is not queued; the assistant says why.
- Channel and format are limited to what `CHANNELS` and `FORMATS` allow.
- It counts against the plan's post limits, with its own ceiling of 3 proposals per brand per day to start.
- The owner approves, edits or rejects it in the usual review. A rejection reason feeds the planner and the assistant, like any other.
- It cannot schedule, publish, approve, delete or edit anything.

### Answer checks, in code

Use the loop primitive in `src/lib/graph/loop.ts`, the way the planner and drafts do. A failed check on a fast-model answer triggers the escalation in "Two models".

1. **Number grounding.** Every number in the answer must appear in a tool result from that turn.
2. **Price and offer check.** Any price or offer named must match Brand DNA. Reuse the existing check.
3. **Tool use.** A question about the business's data must be answered from at least one tool result.
4. **Honesty rule** from Sprint 2: lift is labelled as an estimate with its baseline, and thin data gets "todavía no hay suficientes datos", not a guess.
5. **Scope.** Questions unrelated to the business's marketing get a one-line redirect.

### Prompt injection and privacy

- Crawled site text, review text and post captions are untrusted. They enter the context only inside tool results, marked as data, and the system prompt says instructions inside them are ignored.
- The only write is `propose_post`, which needs the owner's confirmation in the UI and lands in review, so injected text cannot publish anything.
- No customer personal data goes to the model. When M-2 adds customer lists, tools return counts and aggregates only.

### Storage

One migration, using the next free number at build time (`0009_sales` and `0010_seo` are reserved):

- `assistant_threads` (tenant, brand, user, title, created).
- `assistant_messages` (thread, role, content, tool calls as JSON, model, escalated yes or no, failed check if any, input, cached and output tokens, cost, latency, created).
- `assistant_insights` (tenant, brand, week, title, body, evidence as JSON, status: new, seen, dismissed, done). Check first whether the existing `suggestions` table fits; reuse it if it does.
- A thumbs up or down per assistant message, with an optional reason.
- Tenant policy on all of them, and the tenant-isolation test extended to cover them.

### Caps: decide, test, decide again

A cap is a cost budget expressed as messages. The eval gives the cost per answer; real usage gives how many messages owners send. Neither is known yet.

**Starting numbers, for testing only:**

| | Messages per brand per day | Messages per brand per month | Post proposals per day |
| --- | --- | --- | --- |
| Beta | 15 | 150 | 3 |
| Starter | 15 | 150 | 3 |
| Pro | 50 | 500 | 3 |

Weekly insights do not count against these.

**Rough cost, to be replaced by measured figures.** Assuming about 6,000 input tokens and 400 output tokens per answer with tools, at the list prices above and before prompt caching:

| | Per answer | 150 messages a month |
| --- | --- | --- |
| Fast model, standard endpoint | about US$0.002 | about US$0.25 |
| Fast model, US endpoint | about US$0.003 | about US$0.50 |
| Strong model | about US$0.010 | about US$1.50 |
| Routed, if 20% escalate | about US$0.004 to 0.005 | about US$0.60 to 0.80 |

The token counts and the 20% are guesses.

**How the caps get set:**

1. Every message already records model, tokens, cost and latency (see Storage). Add an admin page, `/admin/asistente`, showing per brand and per plan: messages per day, cost per message, escalation rate, monthly cost, cap hits, and thumbs up and down.
2. **Round 1, Juanberto's, two weeks.** No cap. Record real cost per answer, the escalation rate, and how often Juan uses it.
3. **Round 2, beta testers, four weeks.** The starting caps above. Look at median and 90th-percentile messages per brand, and how many brands hit the cap.
4. **Decide.** Set each plan's cap near the 90th percentile of real use, provided the monthly model cost per brand stays under a share of the plan price that Juan picks (proposed: 5% for Starter, 8% for Pro). If it does not fit, change the routing or lower the cap.
5. Repeat after any model, provider or price change.

Mechanics:

- Caps live in one config object in `limits.ts` until plan entitlements replace it, so changing a number is a one-line change with no migration.
- An escalated message counts as one message for the owner, and as two model calls in `credit_ledger`.
- Every model call writes to `credit_ledger`, retries and insights included.
- A global daily spend ceiling, `ASSISTANT_DAILY_USD_CAP`, enforced in code.
- Hitting a cap shows a plain Spanish message that says when it resets and, for Starter, that Pro has more.

### Voice

- Mexican Spanish, "tú", short sentences, no marketing jargon. Lead with the answer, then one reason, then one thing to do.
- At most one suggestion per answer unless asked for more.
- Both models share one system prompt, so the owner cannot tell which one answered.
- Copy lives in `src/i18n/es.ts`.
- Brand: red `#F40A0A`, Nunito, the ball as the avatar.

## Build order

Each PR ships on its own, with tests, behind the flag.

**PR 1: provider, metering and the eval**

- Provider layer with the two roles and `ASSISTANT_MODE`, environment variables, the flag and the tenant allowlist.
- `credit_ledger` writes for assistant calls.
- An eval script (`scripts/eval-assistant.ts`) with 25 to 30 realistic owner questions against invented fixture data. For each setup it records: right tool chosen, numbers match the fixture, checks passed first time, latency, tokens and cost per answer. Juan scores how natural the Spanish reads, 1 to 5.
- Setups to run: DeepSeek-V4.1-Flash alone, GLM-5.2 alone, GLM-5.3 alone (if its weights are open), and routed with each GLM version as the strong model. Optional: GLM-5.3-Flash as an alternative fast model.
- Pass bar for the routed setup: right tool on at least 90% of questions, zero ungrounded numbers reaching the owner, median answer under 6 seconds, Spanish at 4 or above on average, and a cost per answer clearly below the strong model alone.
- If routed does not beat the strong model alone on cost at equal quality, say so and recommend the simpler setup.
- Write the result, the chosen models, endpoints and regions, the escalation rate and the measured cost per answer in `claude/decisions.md`.

**PR 2: read tools and chat**

- The v1 read tools, with unit tests and the tenant-isolation test.
- `POST /api/assistant/chat`, streaming, with the answer checks, the escalation and the caps.
- Migration for threads, messages and feedback.
- Chat UI: a ball button on the brand pages that opens a panel, with four suggested questions, thread history and thumbs up and down. Works on a phone.
- `/admin/asistente` usage page.
- Then Stage 2: allowlist Juanberto's and start Round 1.

**PR 3: propose a post**

- `propose_post` with the confirmation step, the strong model, the existing draft checks and the daily ceiling.
- Review queue shows which drafts came from the assistant.
- Tests: no draft without a confirmed proposal ID; a draft that fails a check is not queued; another tenant's brand cannot be targeted.

**PR 4: weekly insights**

- A Monday job per brand (same scheduler the planner uses) that runs a fixed set of analyses through the tools. The fast model drafts candidates; the strong model critiques, rewrites and picks three, each with its evidence.
- A check in code: each insight cites at least one tool result, and no insight repeats last week's.
- A dashboard card listing them, with "Hecho", "No me sirve" and "Hazme el post" (which starts a `propose_post` confirmation).
- Dismissal reasons feed the next run, the way rejection reasons feed the planner.

**Later**

- Sales, lift and Google tools as their sprints land.
- "Modelo de IA superior" add-on (`strong_only` for that tenant), after Sprint 5 billing.
- Chat by WhatsApp reply, and the top insight in the Monday message, after Sprint 3.
- Stage 3 release to beta testers, once the conditions in "Private testing gate" are met.

## For the model building this

- Read the repo before writing code: find how the planner calls its model, how `loop.ts` is used, how tenant context is set for queries, how drafts are created and checked, and how `credit_ledger` rows are shaped. Follow those patterns.
- Do not add a new framework if the repo already has an equivalent.
- No changes to the Meta app, `/privacidad`, DNS, Neon Auth or Stripe settings.
- Leave the flag off in Production. Do not add the assistant to the public page.
- Stop and ask Juan for the Fireworks API key; do not sign up for anything.

## Still open

- Fireworks account and API key: Juan.
- Which Fireworks endpoints run in the United States, and whether the US endpoint's higher price applies to us.
- GLM-5.2 or 5.3 as the strong model, from the eval.
- Final caps and the cost share per plan, after Rounds 1 and 2.
- Price of the "modelo de IA superior" add-on, after the eval.
- Name and character.
- Whether Meta's data-processor declaration needs Fireworks added. Check after the App Review closes.
