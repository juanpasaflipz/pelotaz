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

## Still to fill in (after the eval runs)

- Chosen setup (`routed`, `fast_only` or `strong_only`) and which GLM version
  won, from `npm run eval:assistant` + `npm run score:assistant`.
- Measured escalation rate and cost per answer for the chosen setup.
- Whether GLM-5.3's quality gain was worth its non-MIT license versus 5.2.
- Resolution on the DeepInfra US-region question above, before Stage 3.
