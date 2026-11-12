# Pelotaz

Marketing on autopilot for Spanish-speaking small businesses. A business pastes its website, Pelotaz builds a brand profile from it, and that profile drives everything written for the business afterwards.

This repository is **phase 1** of the build plan: the multi-tenant foundation, site crawling, and Brand DNA. Planning, drafting, the approval queue, publishing and billing are later phases; their tables exist but nothing reads or writes them yet.

## What works today

1. Paste a site URL, pick a goal and a country.
2. The site is crawled: up to 20 pages, most informative first, obeying `robots.txt`.
3. A language model drafts the brand profile (voice, audience, offers, rules). Colours, fonts and logo are read from the site's markup and CSS, not guessed by the model.
4. The draft is checked twice: a second model pass lists claims the pages do not support, and code verifies that every price in the profile appears on the site as a price.
5. The owner reviews and edits the profile in Spanish. Each save is a new version; nothing is overwritten.

## Setup

Requires Node 22.19 or newer (`nvm use` picks it up from `.nvmrc`; `npm install` refuses older versions) and a Postgres 16 database (Neon works).

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL, LLM_MODEL and its API key
npm run db:migrate
npm run db:seed                 # prints AUTH_MODE and DEV_TENANT_ID for .env.local
npm run dev
```

To try onboarding on a real site without setting up a database (it uses a throwaway in-process Postgres):

```bash
npm run try -- https://www.example.mx --crawl-only   # what the crawler reads; no model, no cost
npm run try -- https://www.example.mx                # full run; needs LLM_MODEL and its API key
```

To see the profile editor without an API key or network access:

```bash
npm run db:seed:demo            # adds a finished demo brand built from an in-memory site
```

| Command | Does |
| --- | --- |
| `npm run dev` | App at http://localhost:3000 |
| `npm test` | Full test suite on in-process Postgres (PGlite), no setup |
| `npm run typecheck` | Route type generation plus `tsc` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run db:generate` | New migration from changes to `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

To run the tests against a real server (worth doing once against a Neon branch, since that is the role setup you deploy to):

```bash
TEST_DATABASE_URL=postgres://user:pass@host/postgres npx vitest run --no-file-parallelism
```

Each test file creates and drops its own `pelotaz_test_*` database, so the role needs `CREATEDB`.

## How it is put together

```
src/
  db/
    schema.ts        all tables, with a row-level security policy on each
    tenant.ts        withTenant(): the only way request code touches tenant data
    client.ts        systemDb(): the connection's own role, for cross-tenant work
  lib/
    crawl/           URL guard, guarded fetcher, robots, discovery, extraction
    brand-dna/       profile schema, build + critique + price check, service
    llm/             one small interface; AI SDK adapter behind it
    onboarding/      trigger: in-process locally, n8n in production
    auth/            Neon Auth client, access rules, and the session seam
    limits.ts        per-tenant ceilings on brands and onboarding runs
  app/               pages, server actions, two route handlers
  i18n/es.ts         every string the product shows
drizzle/             SQL migrations (0000 role, 0001 schema, 0002 grants + ledger trigger)
test/                suites plus an invented restaurant site as a fixture
```

### Tenant isolation

Every table has a `tenant_id` and a Postgres row-level security policy. Request code calls `withTenant(db, tenantId, fn)`, which opens a transaction, switches to the `app_tenant` role and sets `app.tenant_id`. Inside it, a query that forgets its `WHERE` clause still sees only one tenant's rows, and writing a row labelled with another tenant is rejected by the database.

`systemDb()` on its own is the table owner and bypasses those policies. Use it only for work that is cross-tenant by nature.

The role that runs migrations is granted `app_tenant` automatically. If the app connects as a different role, run `GRANT app_tenant TO <that_role>` once.

### Sign-in and access

Sign-in is Neon Auth, which is Better Auth run by Neon: users and sessions are stored in this project's own database under the `neon_auth` schema, and they branch with it. Set `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` to turn it on.

`src/lib/auth/session.ts` is the only place that knows about the provider. The first time a signed-in person is let in, a tenant and an owner membership are created for them. Two rules decide who is let in:

- **The address must be confirmed.** Turn on "Verify email at signup" in the Neon Console. An unconfirmed account is held at a "confirma tu correo" screen and gets no workspace.
- **`SIGNUP_ALLOWLIST`, when set, limits who gets a workspace** to listed addresses or domains. Confirmation is checked first, so nobody can claim an invited address they do not control.

**Every domain the app runs on must be a trusted domain in Neon Auth** (Console, Auth, Configuration, Domains): for example `https://www.pelotaz.com` and `https://pelotaz.com`, with the protocol and no trailing slash. Localhost is trusted by default, so sign-in works locally and then fails on a new production domain until this is done. The forms say so when it happens, and the server log records `INVALID_ORIGIN`.

`src/proxy.ts` redirects signed-out visitors to the sign-in page. It is a convenience: every page, action and route handler checks the session itself.

Without the Neon settings, `AUTH_MODE=dev` signs every request in as one tenant for local work and refuses to run in a production build.

### Credits

`credit_ledger` is append-only for tenant code (it has `SELECT` and `INSERT` on that table and nothing else). A trigger keeps `tenants.credit_balance` equal to the ledger sum, and a `CHECK` keeps the balance from going negative, so a debit that would overdraw aborts the whole transaction it is part of. Nothing spends credits yet; the mechanism is in place and tested for phase 2.

### Fetching user-supplied URLs

Anyone can paste any URL, and the server fetches it, so the fetcher is built to stay off the server's own network:

- only `http` and `https`, default ports, no credentials in the URL;
- private, loopback, link-local (cloud metadata) and reserved addresses are refused, including IPv4-mapped IPv6 and alternate spellings such as `http://2130706433`;
- the check runs inside the HTTP client's DNS resolver, so the address that is validated is the address that is connected to;
- redirects are followed by hand and every hop is re-checked;
- responses are capped by size and time, and must be the expected content type.

### Model output

The crawled text is passed to the model as fenced, untrusted data with an instruction to ignore anything in it addressed to an AI. This lowers the risk of a site steering its own profile; it does not eliminate it, which is one reason every profile goes to a person before it is used.

`LLM_MODEL` is `"<provider>:<model>"` with `anthropic` and `openai` wired in. Set `LLM_MODEL_CRITIC` in the same format to run the audit pass on a smaller, cheaper model; left unset, `LLM_MODEL` does both. Token usage for each call is stored on the profile version it produced (`brand_dna.llm_usage`), which is the raw data for unit cost.

## Production trigger with n8n

Locally, onboarding runs inside the Next.js process after the response is sent. In production set `N8N_ONBOARD_WEBHOOK_URL`, and the app posts `{ tenantId, brandId, force }` there instead, with the header `x-pelotaz-secret`. The n8n workflow is three nodes:

1. **Webhook**, `POST`. Reject the request unless `x-pelotaz-secret` equals your `INTERNAL_API_SECRET`.
2. **HTTP Request**, `POST {APP_URL}/api/internal/brands/{{brandId}}/onboard`, header `x-pelotaz-secret`, JSON body `{ "tenantId": ..., "force": ... }`, timeout 300 s, retry on failure.
3. **Respond to Webhook** with the result.

The endpoint is safe to call twice: the first call claims the brand, a second gets `{"state":"skipped"}`. The workflow has not been built or run in n8n yet; the endpoint it calls has been exercised directly.

## What is tested

`npm test` runs 174 tests. They use the real migrations on a real Postgres engine, the real fetcher against a local HTTP server, and the AI SDK's own mock model for the adapter.

- **Tenant isolation**: reads, updates, deletes and inserts across tenants; the tenant role with no tenant set; the role being dropped when the transaction ends.
- **Access and limits**: workspace creation (once, even with simultaneous first visits), the allowlist, unconfirmed addresses, brand and daily-run ceilings under concurrency.
- **Credit ledger**: balance tracking, overdraft aborting a transaction, append-only, idempotency keys.
- **URL guard and fetcher**: 28 unsafe URL forms, redirects into private space, a hostname that resolves inward at connect time, size cap, content type, charset.
- **Crawler**: page priority, `robots.txt`, sitemaps, failures, palette, fonts, logo, social links.
- **Brand DNA**: the full onboarding run, invented prices being flagged, critic failure, model failure, thin sites, concurrent triggers, retries, edits and versions.

The suite also passes against Postgres 16 with a non-superuser owner role.

## Not done yet

- **Sign-in has not been run against a live Neon Auth project.** The code is typed against the SDK, and with the settings present signed-out and forged requests are redirected to sign-in, but no real account has signed up or signed in yet. Do that once after enabling Auth in the Neon Console.
- **Password reset and Google sign-in.** Not built. Email and password only.
- **Prompt tuning on more than one site.** Onboarding has been run for real on one restaurant site. Other kinds of business will surface other mistakes.
- **JavaScript-rendered sites.** Pages are fetched as HTML, not rendered in a browser. A site that builds its content client-side yields little text and is reported as such rather than guessed at.
- **Plan-based limits.** Each tenant has a ceiling on brands and on onboarding runs per day (`MAX_BRANDS_PER_TENANT`, `ONBOARDINGS_PER_DAY`). These are safety limits, not entitlements tied to a paid plan.
- **Phases 2 to 6**: planner, drafts, approval queue, channel adapters, metrics, suggestions, images, video, billing, WhatsApp, local payments.
- **English UI.** Strings are externalised in `src/i18n/es.ts`; only Spanish exists.
