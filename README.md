# Pelotaz

Marketing on autopilot for Spanish-speaking small businesses. A business pastes its website, Pelotaz builds a brand profile from it, and that profile drives everything written for the business afterwards.

This repository covers **phase 1** (the multi-tenant foundation, site crawling, Brand DNA) and the first part of **phase 2** (weekly plan, drafts, approval). Publishing to channels, metrics and billing are later phases.

## What works today

1. Paste a site URL, pick a goal and a country.
2. The site is crawled: up to 20 pages, most informative first, obeying `robots.txt`.
3. A language model drafts the brand profile (voice, audience, offers, rules). Colours, fonts and logo are read from the site's markup and CSS, not guessed by the model.
4. The draft is checked twice: a second model pass lists claims the pages do not support, and code verifies that every price in the profile appears on the site as a price.
5. The owner reviews and edits the profile in Spanish. Each save is a new version; nothing is overwritten.
6. **Plan de la semana**: the model proposes 3 to 7 posts for the coming week (day, channel, pillar, featured offer) from the profile, then writes each one in the brand's voice and picks a photo from the brand's own site.
7. Every post is checked like the profile: prices in code against the site and the profile, banned words in code, and a second model pass for claims the profile does not support. The owner's own edits get the code checks too.
8. The owner edits, approves, rejects or asks for a rewrite ("más corto, sin emojis"). Approved posts are copied out by hand for now; nothing is published automatically.
9. **Publicación automática**: with the brand's Facebook Page and Instagram account connected, approving a post schedules it for its day at the time the owner picks (12:30 by default). A scheduler publishes due posts. Failures go back to the owner as "approved" with the reason; a post interrupted mid-send is never re-sent automatically.
10. **Resultados**: once a day, for 30 days after publishing, Pelotaz reads each post's views, reach, likes, comments, shares and saves from Meta and shows them on the post. The planner sees the latest results of recent posts and leans toward what earned more interactions for its reach.
11. **Aprende de tus cambios**: Pelotaz compares the drafts with the owner's edits and proposes profile changes: facts they corrected (a price, a recipe, the rating) and style they changed the same way in two or more posts. The owner ticks which to apply; applied changes become a new profile version marked "ajustada con tus comentarios". The model can only propose from a fixed set of operations, which code applies, so it cannot rewrite anything it does not show.

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
npm run try -- https://www.example.mx --week         # then plan next week and draft every post
```

To see the profile editor without an API key or network access:

```bash
npm run db:seed:demo            # adds a finished demo brand and a planned week, from an in-memory site
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
    content/         weekly plan, post drafts, checks, approval
    learning/        profile changes proposed from the owner's edits
    calendar/        holidays and commercial dates per country, for the planner
    meta/            Graph API client, token encryption, signed OAuth state
    publishing/      connections, scheduling, the publisher
    llm/             one small interface; AI SDK adapter behind it
    onboarding/      trigger: in-process locally, n8n in production
    auth/            Neon Auth client, access rules, and the session seam
    limits.ts        per-tenant ceilings on brands and onboarding runs
  app/               pages, server actions, two route handlers
  i18n/es.ts         every string the product shows
drizzle/             SQL migrations (0000 role, 0001 schema, 0002 grants + ledger trigger, 0003 plan and draft review, 0004 publishing, 0005 post results)
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

**Every domain the app runs on must be a trusted domain in Neon Auth** (Console, Auth, Configuration, Domains): for example `https://www.pelotaz.com` and `https://pelotaz.com`, with the protocol and no trailing slash. Localhost is trusted by default, so sign-in works locally and then fails on a new production domain until this is done. The forms say so when it happens, and the server log records the provider's reply.

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

## Publishing to Instagram and Facebook

Off until these are set: `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), and `APP_URL` (on Vercel the production address is used when it is unset). Optional: `META_LOGIN_CONFIG_ID` for Facebook Login for Business.

1. **Meta app.** In developers.facebook.com create an app of type *Business*, add *Facebook Login for Business* and *Instagram* (API with Facebook Login). Valid OAuth redirect URI: `https://www.pelotaz.com/api/connect/meta/callback`.
2. **Permissions.** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, and for results `instagram_manage_insights` and `read_insights`. They go in the Facebook Login for Business configuration (`META_LOGIN_CONFIG_ID`); a connection made before a permission was added must be made again. While the app is in development mode they work for people with a role on the app; customers need *Advanced access*, which needs Meta's App Review and Business Verification.
3. **Accounts.** The Instagram account must be a professional (business or creator) account linked to the Facebook Page.
4. **Scheduler.** `vercel.json` has Vercel Cron call `/api/cron/publish` every 10 minutes; set `CRON_SECRET` (at least 32 characters) in Vercel and it sends it as `Authorization: Bearer`. Every-10-minute crons need Vercel Pro. Any other scheduler (n8n) can call the same route with `Authorization: Bearer <INTERNAL_API_SECRET>`.

How it works: tokens are the Page access tokens obtained from a long-lived user token, stored AES-256-GCM encrypted. Instagram takes only JPEGs at a public URL, so `/api/media/<asset id>` fetches the photo from the brand's site through the guarded fetcher and converts it (feed: cropped into 4:5 to 1.91:1; story: fitted onto a 9:16 canvas). That route is public by necessity and serves only photos already public on the brand's own site. Facebook stories are not published through the API, so the planner gives Facebook only feed posts.

## Production trigger with n8n

Locally, onboarding runs inside the Next.js process after the response is sent. In production set `N8N_ONBOARD_WEBHOOK_URL`, and the app posts `{ tenantId, brandId, force }` there instead, with the header `x-pelotaz-secret`. The n8n workflow is three nodes:

1. **Webhook**, `POST`. Reject the request unless `x-pelotaz-secret` equals your `INTERNAL_API_SECRET`.
2. **HTTP Request**, `POST {APP_URL}/api/internal/brands/{{brandId}}/onboard`, header `x-pelotaz-secret`, JSON body `{ "tenantId": ..., "force": ... }`, timeout 300 s, retry on failure.
3. **Respond to Webhook** with the result.

The endpoint is safe to call twice: the first call claims the brand, a second gets `{"state":"skipped"}`. The workflow has not been built or run in n8n yet; the endpoint it calls has been exercised directly.

## What is tested

`npm test` runs 226 tests. They use the real migrations on a real Postgres engine, the real fetcher against a local HTTP server, and the AI SDK's own mock model for the adapter.

- **Tenant isolation**: reads, updates, deletes and inserts across tenants; the tenant role with no tenant set; the role being dropped when the transaction ends.
- **Access and limits**: workspace creation (once, even with simultaneous first visits), the allowlist, unconfirmed addresses, brand and daily-run ceilings under concurrency.
- **Credit ledger**: balance tracking, overdraft aborting a transaction, append-only, idempotency keys.
- **URL guard and fetcher**: 28 unsafe URL forms, redirects into private space, a hostname that resolves inward at connect time, size cap, content type, charset.
- **Crawler**: page priority, `robots.txt`, sitemaps, failures, palette, fonts, logo, social links.
- **Brand DNA**: the full onboarding run, invented prices being flagged, critic failure, model failure, thin sites, concurrent triggers, retries, edits and versions.
- **Publishing**: token encryption and tamper detection, signed OAuth state, the Instagram container flow, story parameters, expired tokens, time zones (with daylight saving), single and multiple Pages, scheduling rules, two schedulers racing (one publish), failures back to the owner, posts stuck mid-send never re-sent, disconnecting.
- **Calendar**: Easter and nth-weekday rules, each market's own dates, paydays, year boundaries, only calendar dates reaching a plan.
- **Learning from edits**: proposals limited to changes that apply, stale or duplicate changes skipped, applied versions marked as feedback, no model call when there is nothing new, tenant isolation.
- **Weekly plan and approval**: invented offers dropped, one post per slot, invented prices and banned words flagged, a failed draft not sinking the plan, double triggers, re-planning never discarding approved posts, owner edits as checked versions, rewrites, photos from another brand refused, tenant isolation.

The suite also passes against Postgres 16 with a non-superuser owner role.

## Not done yet

- **Sign-in has not been run against a live Neon Auth project.** The code is typed against the SDK, and with the settings present signed-out and forged requests are redirected to sign-in, but no real account has signed up or signed in yet. Do that once after enabling Auth in the Neon Console.
- **Google sign-in.** Not built. Email and password, with password reset by emailed code (or link, if the Neon project sends links). Reset has not been run against Neon yet.
- **Prompt tuning on more than one site.** Onboarding has been run for real on one restaurant site. Other kinds of business will surface other mistakes.
- **JavaScript-rendered sites.** Pages are fetched as HTML, not rendered in a browser. A site that builds its content client-side yields little text and is reported as such rather than guessed at.
- **Plan-based limits.** Each tenant has a ceiling on brands and on onboarding runs per day (`MAX_BRANDS_PER_TENANT`, `ONBOARDINGS_PER_DAY`). These are safety limits, not entitlements tied to a paid plan.
- **The weekly plan has been run with test models only.** Run `npm run try -- <site> --week` with a real key before relying on it.
- **Photos are picked by description and file name** when the week is planned, each at most once. The model does not see them; the owner can swap the photo on each post.
- **Calendar coverage.** Plans may mention only dates from `src/lib/calendar/calendar.ts`: national holidays, main commercial dates and, in Mexico, the quincena paydays, for each market. Dates that change every year (El Buen Fin, the Super Bowl) are entered by hand per year with their source; Liga MX and other sports are not in yet.
- **Publishing has not run against Meta.** It is built and tested against a fake Graph API; it needs a Meta app, and customers other than you need Meta's App Review. Instagram stories via the API are less documented than feed posts; check the first one.
- **Later phases**: channel adapters, metrics, suggestions, generated images, video, billing, WhatsApp, local payments.
- **English UI.** Strings are externalised in `src/i18n/es.ts`; only Spanish exists.
