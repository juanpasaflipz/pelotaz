import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BrandDnaProfile, ReviewFlag } from "@/lib/brand-dna/schema";
import type { LlmUsage } from "@/lib/llm/types";
import type { PageAssets } from "@/lib/crawl/types";

/**
 * Tenant isolation model
 * ----------------------
 * Request-scoped code never queries with the connection's own role. It goes
 * through `withTenant()` (src/db/tenant.ts), which opens a transaction, sets
 * `app.tenant_id`, and switches to the `app_tenant` role. Every table below
 * carries a policy for that role, so a query that forgets its WHERE clause
 * still only sees one tenant's rows.
 *
 * The role itself is created in migration 0000 (roles are cluster-wide, so it
 * has to be idempotent) and is marked `.existing()` here so drizzle-kit does
 * not try to manage it.
 */
export const appTenant = pgRole("app_tenant").existing();

const currentTenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

const tenantPolicy = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: "permissive",
    to: appTenant,
    for: "all",
    using: sql`tenant_id = ${currentTenant}`,
    withCheck: sql`tenant_id = ${currentTenant}`,
  });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("starter"),
    /**
     * Sum of credit_ledger.amount, maintained by a trigger on the ledger
     * (migration 0002). Request-scoped code cannot write this column.
     */
    creditBalance: integer("credit_balance").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    // Debits that would overdraw fail in the database, inside the same
    // transaction as the work they pay for.
    check("tenants_credit_balance_nonnegative", sql`${t.creditBalance} >= 0`),
    pgPolicy("tenants_self", {
      as: "permissive",
      to: appTenant,
      for: "select",
      using: sql`id = ${currentTenant}`,
    }),
  ],
);

/**
 * Links an identity from the auth provider to a tenant. `userId` is whatever
 * stable id the provider issues; no auth provider is wired in yet.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user").on(t.tenantId, t.userId),
    index("memberships_user").on(t.userId),
    tenantPolicy("memberships"),
  ],
);

// ---------------------------------------------------------------------------
// Brands and Brand DNA
// ---------------------------------------------------------------------------

export const brandGoal = pgEnum("brand_goal", [
  "sales",
  "followers",
  "leads",
  "traffic",
]);

export const brandStatus = pgEnum("brand_status", [
  "pending",
  "crawling",
  "building",
  "ready",
  "failed",
]);

export const brands = pgTable(
  "brands",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceUrl: text("source_url").notNull(),
    goal: brandGoal("goal").notNull().default("sales"),
    /** ISO 3166-1 alpha-2. Drives regional voice, calendar and payments. */
    country: text("country").notNull().default("MX"),
    /** BCP 47 tag for generated content. */
    locale: text("locale").notNull().default("es-MX"),
    status: brandStatus("status").notNull().default("pending"),
    /** Machine-readable reason when status is `failed`. */
    statusDetail: text("status_detail"),
    /** Per-channel autopilot flags, e.g. { "instagram": true }. */
    autopilot: jsonb("autopilot").$type<Record<string, boolean>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("brands_tenant").on(t.tenantId), tenantPolicy("brands")],
);

export const brandDnaSource = pgEnum("brand_dna_source", [
  "crawl",
  "user_edit",
  "feedback",
]);

export const brandDna = pgTable(
  "brand_dna",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    profile: jsonb("profile").$type<BrandDnaProfile>().notNull(),
    source: brandDnaSource("source").notNull(),
    /** Claims the critic could not find support for in the crawled pages. */
    reviewFlags: jsonb("review_flags").$type<ReviewFlag[]>().notNull().default([]),
    /** Token usage for the calls that produced this version, for unit cost. */
    llmUsage: jsonb("llm_usage").$type<LlmUsage[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("brand_dna_brand_version").on(t.brandId, t.version),
    tenantPolicy("brand_dna"),
  ],
);

export const crawlPages = pgTable(
  "crawl_pages",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    text: text("text").notNull(),
    assets: jsonb("assets").$type<PageAssets>().notNull(),
    httpStatus: integer("http_status").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crawl_pages_brand_url").on(t.brandId, t.url),
    tenantPolicy("crawl_pages"),
  ],
);

// ---------------------------------------------------------------------------
// Channels, planning, content. Plans, content items, drafts and assets are
// used by the weekly planner (phase 2); connections and publications wait for
// channel publishing.
// ---------------------------------------------------------------------------

export const connections = pgTable(
  "connections",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    /** Ciphertext only. The key lives outside the database. */
    encryptedTokens: text("encrypted_tokens").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("connections_brand_channel_account").on(
      t.brandId,
      t.channel,
      t.externalAccountId,
    ),
    tenantPolicy("connections"),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    rationale: text("rationale"),
    /** planning → drafting → ready, or failed with `status_detail`. */
    status: text("status").notNull().default("planning"),
    statusDetail: text("status_detail"),
    /** The Brand DNA version the plan was written from. */
    brandDnaVersion: integer("brand_dna_version"),
    llmUsage: jsonb("llm_usage").$type<LlmUsage[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("plans_brand_week").on(t.brandId, t.weekStart),
    tenantPolicy("plans"),
  ],
);

export const contentStatus = pgEnum("content_status", [
  "planned",
  "drafting",
  "needs_approval",
  "approved",
  "scheduled",
  "published",
  "failed",
  "rejected",
]);

export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    format: text("format").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull().default({}),
    status: contentStatus("status").notNull().default("planned"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("content_items_due").on(t.status, t.scheduledAt),
    index("content_items_brand").on(t.brandId),
    tenantPolicy("content_items"),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** For images taken from the brand's site, the original URL on that site. */
    storageUrl: text("storage_url").notNull(),
    alt: text("alt"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("assets_brand_url").on(t.brandId, t.storageUrl),
    tenantPolicy("assets"),
  ],
);

export const drafts = pgTable(
  "drafts",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    copy: text("copy").notNull(),
    assetIds: jsonb("asset_ids").$type<string[]>().notNull().default([]),
    model: text("model"),
    /** `generated` by the model, or `user_edit`. */
    source: text("source").notNull().default("generated"),
    /** What the owner asked to change, when this version is a rewrite. */
    instruction: text("instruction"),
    /** Claims the checks could not support. Same shape as on Brand DNA. */
    reviewFlags: jsonb("review_flags").$type<ReviewFlag[]>().notNull().default([]),
    costCredits: integer("cost_credits").notNull().default(0),
    llmUsage: jsonb("llm_usage").$type<LlmUsage[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("drafts_item_version").on(t.contentItemId, t.version),
    tenantPolicy("drafts"),
  ],
);

export const publications = pgTable(
  "publications",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "restrict" }),
    externalId: text("external_id"),
    permalink: text("permalink"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    // One publication per item per connection: the database refuses a double post.
    uniqueIndex("publications_item_connection").on(t.contentItemId, t.connectionId),
    tenantPolicy("publications"),
  ],
);

export const metricsDaily = pgTable(
  "metrics_daily",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    conversions: bigint("conversions", { mode: "number" }).notNull().default(0),
    /** Spend in the currency's minor unit (centavos for MXN). */
    spendMinor: bigint("spend_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("MXN"),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.day] }),
    tenantPolicy("metrics_daily"),
  ],
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** The rows the suggestion was computed from. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  () => [tenantPolicy("suggestions")],
);

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

export const creditKind = pgEnum("credit_kind", [
  "grant_monthly",
  "grant_daily",
  "topup",
  "debit",
  "refund",
]);

/**
 * Append-only. `app_tenant` is granted SELECT and INSERT on this table and
 * nothing else (migration 0002), so a row cannot be edited or removed from
 * request-scoped code.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: creditKind("kind").notNull(),
    /** Signed: grants and refunds are positive, debits negative. */
    amount: integer("amount").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    note: text("note"),
    /** Set for webhook-driven rows so a replayed webhook cannot grant twice. */
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_ledger_idempotency").on(t.tenantId, t.idempotencyKey),
    tenantPolicy("credit_ledger"),
  ],
);

export const jobState = pgEnum("job_state", ["queued", "running", "done", "failed"]);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Unique per tenant. A retried trigger finds the existing row instead of starting twice. */
    idempotencyKey: text("idempotency_key").notNull(),
    state: jobState("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jobs_tenant_key").on(t.tenantId, t.idempotencyKey),
    tenantPolicy("jobs"),
  ],
);
