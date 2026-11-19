# Assistant build decisions

Companion to `docs/pelota-assistant.md`. That doc specs Fireworks AI as the
provider and references `claude/roadmap.md`, `claude/missing-checklist.md`
and `claude/decisions.md`, none of which exist in this repo. This file is
where those decisions actually live.

## Provider: DeepInfra, not Fireworks

Juan's call, not the doc's: DeepInfra, OpenAI-compatible, one key for both
models. `.env.local` already has `ASSISTANT_BASE_URL` and `ASSISTANT_API_KEY`
set to it. Confirmed against DeepInfra's own docs, not assumed:

- Base URL: `https://api.deepinfra.com/v1/openai` (chat completions at
  `.../chat/completions`).
- Rule carried over unchanged from the doc: never call Z.ai's or DeepSeek's
  own APIs — only ever `api.deepinfra.com`.

## Models (confirmed 2026-11-17, DeepInfra's own model pages)

| | Fast: DeepSeek-V4.1-Flash | Strong: GLM-5.2 | Strong: GLM-5.3 |
|---|---|---|---|
| Model id (as sent in the `model` field) | `deepseek-ai/DeepSeek-V4.1-Flash` | `zai-org/GLM-5.2` | `zai-org/GLM-5.3` |
| Quantization | fp8 | fp4 | fp4 |
| Price, input / output per 1M tokens | $0.14 / $0.42 | $0.563 / $1.80 | $0.563 / $2.50 |
| Cached input, per 1M tokens | $0.004 | $0.105 | not published yet — `pricing.ts` falls back to the standard input rate |
| Context | 1,048,576 tokens | 1,048,576 tokens | 1,048,576 tokens (same base model as 5.2) |
| Weights | — (DeepSeek, not open-weight on DeepInfra) | Open weights, **MIT** license | Open weights, but under Z.ai's **custom `glm-5.3` license**, not MIT |

Sources: `deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash`,
`deepinfra.com/zai-org/GLM-5.2`, `deepinfra.com/zai-org/GLM-5.3`;
`letsdatascience.com/news/zai-releases-glm-53-under-conditional-license` and
`thenewstack.io/zai-glm-weights-license` for the GLM-5.3 license. **Re-check
all of these on the next provider or price change** — the doc's own "decide,
test, decide again" rule applies to this table too.

**GLM-5.3's license, in plain terms:** open weights, published on Hugging
Face, but under a bespoke `glm-5.3` license rather than MIT. Its one
practical restriction — a security review by Z.ai once a licensee's annual
revenue passes $10B — is irrelevant at Pelotaz's scale. GLM-5.2 and
GLM-5.3-**Flash** (a different, smaller model, not what's used here) are
plain MIT if a cleaner license ever matters more than GLM-5.3's quality.

**Where it runs.** DeepInfra operates its own GPU infrastructure: 8+ data
centers in the US (Washington, Utah, Georgia, Oregon, California — exact
cities undisclosed) plus one in Toronto. Unlike Fireworks, **DeepInfra's
shared/serverless API has no documented per-model region pinning or separate
"US-only" endpoint.** Pelotaz declared US processors to Meta; this is an open
item, not a blocker yet (no production traffic), but it needs resolving
before Stage 3. A hard US guarantee would mean DeepInfra's paid "private
deployment" (dedicated instance), not the shared API this PR uses.

**Data use.** Per `docs.deepinfra.com/account/data-privacy`: DeepInfra does
not train on submitted API data and does not store prompts/outputs to disk
during inference (memory-only, deleted once the response is returned). The
one exception is when the underlying model is from **Google or Anthropic**,
where that vendor's own retention policy applies instead. DeepSeek and GLM
are open-weight models DeepInfra serves directly, so the standard (no
training, no disk storage) policy applies to both models used here.

## Credit conversion rate: provisional

`src/lib/assistant/ledger.ts` converts a call's USD cost into the integer
`amount` `credit_ledger` debits, using one named constant, `CREDIT_USD =
0.0001` (1 credit = $0.0001). **This is a placeholder**, confirmed with Juan
2026-11-17 — no credit pricing exists anywhere else in the repo yet (README:
"Nothing spends credits yet"). Change it in `ledger.ts` first, here second,
once credits are actually priced. Credits are never shown to users or in the
eval's own reporting; `costUsd` (real USD, from `pricing.ts`) stays the
source of truth everywhere else, including the eval.

## Overdraft handling: confirmed with Juan 2026-11-17

Every tenant's `credit_balance` is 0 today (nothing anywhere grants
credits), so the assistant's first-ever debit would otherwise hit the
existing `tenants_credit_balance_nonnegative` CHECK and abort the whole
transaction it's part of. Decision: wrap the debit in its own savepoint;
on that specific failure, roll back just the insert, log a warning, and
return the real cost to the caller anyway (`recorded: false`) rather than
blocking the answer. Any other DB error still propagates. For PR 2: once
`assistant_messages` exists, persist cost and tokens on that row directly
too, so usage data is never solely dependent on the ledger write succeeding.

## Eval system prompt: today's date and arithmetic, confirmed with Juan 2026-11-18

The smoke test against `fast_only` surfaced two things the system prompt
needed to say explicitly:

- **Today's date.** With no date in the prompt, the fast model guessed wild,
  wrong absolute periods for "esta semana" / "la semana pasada" / "ayer"
  (e.g. "junio 2025"), got empty tool results for those, and correctly
  refused to invent a comparison — safe, but it meant every relative-date
  question failed the grounding check for the wrong reason. The eval's
  prompt now ends with a **fixed** date line, `Hoy es jueves 12 de noviembre
  de 2026.` — fixed, not the real clock, so a run stays reproducible against
  fixtures pinned to specific November 2026 dates, and kept last so the rest
  of the prompt stays a stable, cacheable prefix. **PR 2 must inject the
  real "today" in the tenant's own timezone** into the production system
  prompt instead of a fixed string — this is a reminder for that PR, not
  something PR 1 builds.
- **No model-side arithmetic.** The fast model computed a difference itself
  ("esta vez subió 46 interacciones y 600 de alcance") instead of calling
  `compare_periods`, violating the doc's "the model does not do maths"
  rule. The prompt now has one explicit line forbidding this and naming
  `compare_periods` as the tool to call instead. Same prompt for every
  setup — this isn't a per-model workaround.

## GLM-5.3 dropped from the eval, confirmed with Juan 2026-11-18

The 2026-11-18 run against real DeepInfra measured GLM-5.3 as strictly
worse than GLM-5.2 for this use, with no offsetting quality gain observed:

| | GLM-5.2 | GLM-5.3 |
|---|---|---|
| Timeouts (strong_only, 40 turns) | 1 | 6 |
| Timeouts (routed, 40 turns) | 1 | 3 |
| Slowest successful call | 19.9s | 36.9s |
| Price, output per 1M | $1.80 | $2.50 |
| License | MIT | custom `glm-5.3`, not MIT |

`strong_only_glm53` and `routed_glm53` are removed from `EVAL_SETUPS`
(`scripts/eval/report.ts`); `GLM_5_3` stays exported there, unused, as a
record of the exact model id if this is ever revisited. GLM-5.3-**Flash**
(a different, smaller, MIT-licensed model) is unaffected and still
available as the optional alt-fast setup.

## Timeout bug: abortSignal alone did not bound the call

The same run measured two calls taking 120s and 292s despite a 20s
`abortSignal` timeout on `generateText` — both ambiguous/exploratory
questions (`q15`, `a3`) that drive many tool-calling steps, where the
abort evidently did not cut the in-flight request off. Fixed in
`src/lib/assistant/provider.ts`'s `callOnce` with a `Promise.race` against
an explicit timeout promise, so the call settles on schedule from the
caller's side regardless of what the abort actually manages to cancel
underneath. Covered by a regression test in `test/assistant-provider.test.ts`
("bounds the whole call even when the underlying request ignores the abort
signal") using a mock that ignores `abortSignal` entirely, reproducing the
same shape of bug. One known residual risk, noted for whoever builds PR 2's
server endpoint: the abandoned call is left running in the background
rather than truly killed, which is fine for a short-lived CLI eval but
could accumulate open connections in a long-running server process under
sustained timeouts — worth checking DeepInfra's/undici's connection pooling
behavior under load before shipping the live chat route.

## AI SDK's own retry was stacking under chat()'s retry, confirmed 2026-11-19

`generateText` was never given a `maxRetries`, so the AI SDK's default (2
retries, 3 attempts) ran *inside* every `callOnce`, underneath `chat()`'s own
outer one-retry in its `catch` block — on a retryable provider error (e.g. a
DeepInfra 429/5xx), a single `chat()` call could have cost up to 3 × 2 = 6
attempts, each still inside the same `timeoutMs` race. Fixed by passing
`maxRetries: 0` to `generateText` in `callOnce`, so the AI SDK makes exactly
one attempt per `callOnce` and `chat()`'s own retry is the only one that
applies. `abortSignal` was already passed into `generateText` (unchanged).
Covered by a new regression test in `test/assistant-provider.test.ts`
("does not let the AI SDK's own retry stack on top of chat()'s one retry"),
using a `APICallError` with `isRetryable: true` to simulate a provider error
the SDK would otherwise retry on its own.

## GLM-5.2 reasoning: on by default, confirmed 2026-11-19

Open question from the 2026-11-18 run: `chat()` never captured
`usage.outputTokenDetails.reasoningTokens` (or AI SDK's separate `reasoning`
string), so there was no way to tell from existing eval data whether GLM-5.2
was thinking. Fixed in `src/lib/assistant/provider.ts` (now stored as
`AssistantUsage.reasoningTokens`) and added `ChatRequest.reasoningEffort`,
forwarded as `providerOptions.openai.reasoningEffort` → DeepInfra's top-level
`reasoning_effort` body field (confirmed against
`docs.deepinfra.com/chat/reasoning`: accepts `none | low | medium | high`,
`none` disables chain-of-thought entirely).

Ran `strong_only_glm52` on 8 questions (4 lookups: `q1`, `q6`, `q9`, `q15`; 4
advice: `a1`-`a4`) once with current (default) settings and once with
`--reasoning-effort=none`:

| | Default (thinking on) | `reasoning_effort: none` |
|---|---|---|
| Avg output tokens | 797 | 310 |
| Avg reasoning tokens | 519 (65% of output) | 0 |
| Avg latency | 14.55s | 4.65s |
| Tool accuracy | 8/8 | 8/8 |
| Grounded | 8/8 | 8/8 |
| Avg cost/answer | $0.00253 | $0.00145 |

GLM-5.2 is thinking by default on DeepInfra, costing roughly 3x the latency
and 1.75x the cost per answer for no measured difference in tool accuracy or
grounding on this small sample. Not conclusive on 8 questions — doesn't touch
Spanish naturalness or advice usefulness (needs `score:assistant`) — but
worth a full eval run (all setups) with `reasoning_effort: "none"` or `"low"`
before Round 1, since the latency gap alone (14.55s vs 4.65s) matters more
than the doc's pass bar numbers suggest if `strong_only`/escalations are ever
in the hot path.

## Still to fill in (after the eval runs)

- Chosen setup (`routed`, `fast_only` or `strong_only`), from
  `npm run eval:assistant` + `npm run score:assistant` — GLM-5.2 is now the
  only strong model under consideration (GLM-5.3 dropped, above).
- Measured escalation rate and cost per answer for the chosen setup.
- Resolution on the DeepInfra US-region question above, before Stage 3.
