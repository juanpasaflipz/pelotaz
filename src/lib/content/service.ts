import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { assets, brandDna, brands, contentItems, crawlPages, drafts, jobs, plans } from "@/db/schema";
import { withTenant, type Db, type TenantTx } from "@/db/tenant";
import type { BrandDnaProfile, ReviewFlag } from "@/lib/brand-dna/schema";
import type { Llm } from "@/lib/llm/types";
import { localDate } from "@/lib/markets";
import { checkCopy, planWeek, writeDraft } from "./build";
import { nextWeekStart, PLAN_LIMITS, type CandidateImage, type PostBrief } from "./schema";

export interface ContentDeps {
  db: Db;
  llm: Llm;
  /** Cheaper model for the critique pass. Defaults to `llm`. */
  critic?: Llm;
}

export interface ContentLimits {
  plansPerDay: number;
  rewritesPerDay: number;
}

const positive = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export function contentLimitsFromEnv(): ContentLimits {
  return {
    plansPerDay: positive(process.env.PLANS_PER_DAY, 6),
    rewritesPerDay: positive(process.env.REWRITES_PER_DAY, 40),
  };
}

/** A run that has not moved for this long is assumed dead and may be restarted. */
const STALE_AFTER_MINUTES = 10;
/** Drafts written at the same time, to keep a plan inside one function's time limit. */
const DRAFT_CONCURRENCY = 3;
const SITE_TEXT_CAP = 200_000;

export type PlanRequest =
  | { state: "started"; planId: string }
  | { state: "running"; planId: string }
  | { state: "has_approved"; planId: string }
  | { state: "not_ready" }
  | { state: "daily_limit" };

async function lockTenant(tx: TenantTx, tenantId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`content:${tenantId}`}))`);
}

/** Count and record a paid run of `kind`; null when there was room. */
async function claimRun(
  tx: TenantTx,
  tenantId: string,
  brandId: string,
  kind: "plan" | "rewrite",
  perDay: number,
): Promise<"daily_limit" | null> {
  await lockTenant(tx, tenantId);
  const [row] = await tx
    .select({ runs: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.kind, kind), sql`${jobs.createdAt} > now() - interval '24 hours'`));
  if (row.runs >= perDay) return "daily_limit";
  await tx.insert(jobs).values({
    tenantId,
    brandId,
    kind,
    idempotencyKey: `${kind}:${brandId}:${crypto.randomUUID()}`,
  });
  return null;
}

const stale = (column: typeof plans.updatedAt) =>
  lt(column, sql`now() - make_interval(mins => ${STALE_AFTER_MINUTES})`);

/**
 * Ask for next week's plan. The work itself runs in `runPlan`; this only
 * decides whether it may start and leaves a `queued` plan for it.
 *
 * Asking again replaces the week's plan, unless the owner has approved a post
 * in it: approved work is never thrown away by a button.
 */
export async function requestPlan(
  db: Db,
  tenantId: string,
  brandId: string,
  limits: ContentLimits,
  now: Date = new Date(),
): Promise<PlanRequest> {
  return withTenant(db, tenantId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId));
    if (!brand || brand.status !== "ready") return { state: "not_ready" };
    const weekStart = nextWeekStart(new Date(`${localDate(brand.country, now)}T00:00:00Z`));

    await lockTenant(tx, tenantId);
    const [existing] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.brandId, brandId), eq(plans.weekStart, weekStart)));

    if (existing) {
      const working = ["queued", "planning", "drafting"].includes(existing.status);
      const live = existing.updatedAt.getTime() > now.getTime() - STALE_AFTER_MINUTES * 60_000;
      if (working && live) return { state: "running", planId: existing.id };
      const [approved] = await tx
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(and(eq(contentItems.planId, existing.id), eq(contentItems.status, "approved")))
        .limit(1);
      if (approved) return { state: "has_approved", planId: existing.id };
    }

    const spent = await claimRun(tx, tenantId, brandId, "plan", limits.plansPerDay);
    if (spent) return { state: spent };

    if (existing) {
      await tx.delete(contentItems).where(eq(contentItems.planId, existing.id));
      await tx
        .update(plans)
        .set({ status: "queued", statusDetail: null, rationale: null, llmUsage: [] })
        .where(eq(plans.id, existing.id));
      return { state: "started", planId: existing.id };
    }
    const [plan] = await tx
      .insert(plans)
      .values({ tenantId, brandId, weekStart, status: "queued" })
      .returning({ id: plans.id });
    return { state: "started", planId: plan.id };
  });
}

interface BrandContext {
  profile: BrandDnaProfile;
  version: number;
  siteText: string;
  images: Array<CandidateImage & { id: string }>;
}

const SKIP_IMAGE = /(^data:)|\.svg(\?|$)|logo|icon|favicon|sprite|placeholder|pixel|badge|flag/i;

/**
 * Photos from the brand's site, recorded as assets so a draft can point at
 * one. Logos and icons are left out: a post needs a picture of the thing.
 */
async function loadBrandContext(tx: TenantTx, tenantId: string, brandId: string): Promise<BrandContext | null> {
  const [dna] = await tx
    .select()
    .from(brandDna)
    .where(eq(brandDna.brandId, brandId))
    .orderBy(desc(brandDna.version))
    .limit(1);
  if (!dna) return null;

  const pages = await tx
    .select({ text: crawlPages.text, assets: crawlPages.assets })
    .from(crawlPages)
    .where(eq(crawlPages.brandId, brandId));

  const found = new Map<string, string | null>();
  const add = (url: string, alt: string | null) => {
    if (found.has(url) || SKIP_IMAGE.test(url) || url === dna.profile.visual.logoUrl) return;
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol)) return;
    } catch {
      return;
    }
    found.set(url, alt?.trim().slice(0, 200) || null);
  };
  for (const url of dna.profile.visual.referenceImages) add(url, null);
  for (const page of pages) for (const image of page.assets.images) add(image.url, image.alt);

  const candidates = [...found].slice(0, PLAN_LIMITS.candidateImages);
  if (candidates.length > 0) {
    await tx
      .insert(assets)
      .values(candidates.map(([url, alt]) => ({ tenantId, brandId, kind: "site_image", storageUrl: url, alt })))
      .onConflictDoNothing({ target: [assets.brandId, assets.storageUrl] });
  }
  const rows = await tx
    .select({ id: assets.id, url: assets.storageUrl, alt: assets.alt })
    .from(assets)
    .where(and(eq(assets.brandId, brandId), eq(assets.kind, "site_image")))
    .orderBy(asc(assets.createdAt), asc(assets.storageUrl));

  return {
    profile: dna.profile,
    version: dna.version,
    siteText: pages.map((page) => page.text).join("\n").slice(0, SITE_TEXT_CAP),
    images: rows.slice(0, PLAN_LIMITS.candidateImages),
  };
}

async function nextDraftVersion(tx: TenantTx, itemId: string): Promise<number> {
  const [row] = await tx
    .select({ latest: sql<number | null>`max(${drafts.version})` })
    .from(drafts)
    .where(eq(drafts.contentItemId, itemId));
  return (row?.latest ?? 0) + 1;
}

/** Write and store one draft for an item that is already marked `drafting`. */
async function draftOne(
  deps: ContentDeps,
  tenantId: string,
  item: { id: string; brandId: string; channel: string; format: string; brief: PostBrief },
  context: BrandContext,
  rewrite?: { copy: string; instruction: string },
  /** The photo the post has now, when there is a previous version. */
  currentAssetIds?: string[],
): Promise<boolean> {
  const { db, llm, critic = llm } = deps;
  // A new version keeps the photo the owner has now; a first draft uses the plan's.
  const assetId = currentAssetIds ? (currentAssetIds[0] ?? null) : (item.brief.imageAssetId ?? null);
  const image = context.images.find((candidate) => candidate.id === assetId) ?? null;
  try {
    const built = await writeDraft(llm, critic, {
      profile: context.profile,
      channel: item.channel,
      format: item.format,
      brief: item.brief,
      image,
      siteText: context.siteText,
      rewrite,
    });
    await withTenant(db, tenantId, async (tx) => {
      await tx.insert(drafts).values({
        tenantId,
        brandId: item.brandId,
        contentItemId: item.id,
        version: await nextDraftVersion(tx, item.id),
        copy: built.copy,
        assetIds: image ? [image.id] : [],
        model: built.usage[0]?.model ?? null,
        source: "generated",
        instruction: rewrite?.instruction ?? null,
        reviewFlags: built.reviewFlags,
        llmUsage: built.usage,
      });
      await tx.update(contentItems).set({ status: "needs_approval" }).where(eq(contentItems.id, item.id));
    });
    return true;
  } catch (error) {
    console.error("draft failed", { itemId: item.id, error: error instanceof Error ? error.message : error });
    // A rewrite that fails leaves the previous version in place for review.
    await withTenant(db, tenantId, async (tx) => {
      const [previous] = await tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.contentItemId, item.id))
        .limit(1);
      await tx
        .update(contentItems)
        .set({ status: previous ? "needs_approval" : "failed" })
        .where(eq(contentItems.id, item.id));
    }).catch(() => {});
    return false;
  }
}

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<unknown>) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(work));
  }
}

export type PlanOutcome =
  | { state: "ready"; posts: number; drafted: number }
  | { state: "failed"; reason: "no_profile" | "llm_error" | "internal_error" }
  | { state: "skipped" };

/**
 * Plan the week, then draft every post. Safe to call twice: the first call
 * claims the queued plan and a second gets `skipped`.
 */
export async function runPlan(deps: ContentDeps, tenantId: string, planId: string): Promise<PlanOutcome> {
  const { db, llm } = deps;

  const claimed = await withTenant(db, tenantId, async (tx) => {
    const [plan] = await tx
      .update(plans)
      .set({ status: "planning", statusDetail: null })
      .where(
        and(
          eq(plans.id, planId),
          or(eq(plans.status, "queued"), and(inArray(plans.status, ["planning", "drafting"]), stale(plans.updatedAt))),
        ),
      )
      .returning();
    if (!plan) return null;
    const context = await loadBrandContext(tx, tenantId, plan.brandId);
    return { plan, context };
  });
  if (!claimed) return { state: "skipped" };
  const { plan, context } = claimed;

  const fail = async (reason: "no_profile" | "llm_error" | "internal_error"): Promise<PlanOutcome> => {
    await withTenant(db, tenantId, (tx) =>
      tx.update(plans).set({ status: "failed", statusDetail: reason }).where(eq(plans.id, planId)),
    ).catch(() => {});
    return { state: "failed", reason };
  };
  if (!context) return fail("no_profile");

  let built;
  try {
    built = await planWeek(llm, { profile: context.profile, weekStart: plan.weekStart, images: context.images });
  } catch (error) {
    console.error("plan failed", { planId, error: error instanceof Error ? error.message : error });
    return fail("llm_error");
  }

  let items;
  try {
    items = await withTenant(db, tenantId, async (tx) => {
      await tx
        .update(plans)
        .set({
          status: "drafting",
          rationale: built.plan.rationale,
          brandDnaVersion: context.version,
          llmUsage: built.usage,
        })
        .where(eq(plans.id, planId));
      return tx
        .insert(contentItems)
        .values(
          built.briefs.map((post) => ({
            tenantId,
            brandId: plan.brandId,
            planId,
            channel: post.channel,
            format: post.format,
            brief: {
              ...post.brief,
              imageAssetId: post.image === null ? null : (context.images[post.image]?.id ?? null),
            } as unknown as Record<string, unknown>,
            status: "drafting" as const,
          })),
        )
        .returning();
    });
  } catch {
    return fail("internal_error");
  }

  let drafted = 0;
  await inBatches(items, DRAFT_CONCURRENCY, async (item) => {
    const ok = await draftOne(
      deps,
      tenantId,
      { ...item, brief: item.brief as unknown as PostBrief },
      context,
    );
    if (ok) drafted += 1;
  });

  await withTenant(db, tenantId, (tx) =>
    tx.update(plans).set({ status: "ready" }).where(eq(plans.id, planId)),
  );
  return { state: "ready", posts: items.length, drafted };
}

export type ItemError = "not_found" | "not_editable" | "empty" | "daily_limit" | "busy";

/** Statuses in which the owner may still change or decide on a post. */
const OPEN: Array<(typeof contentItems.status.enumValues)[number]> = ["needs_approval", "rejected", "failed"];

/**
 * Mark a post for rewriting with the owner's instruction. Returns what to pass
 * to `runRewrite`, which does the model work after the response.
 */
export async function requestRewrite(
  db: Db,
  tenantId: string,
  itemId: string,
  instruction: string,
  limits: ContentLimits,
): Promise<{ ok: true } | { ok: false; error: ItemError }> {
  const text = instruction.trim().slice(0, 500);
  return withTenant(db, tenantId, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, itemId));
    if (!item) return { ok: false, error: "not_found" };
    if (!OPEN.includes(item.status)) return { ok: false, error: item.status === "drafting" ? "busy" : "not_editable" };
    const spent = await claimRun(tx, tenantId, item.brandId, "rewrite", limits.rewritesPerDay);
    if (spent) return { ok: false, error: spent };
    await tx
      .update(contentItems)
      .set({ status: "drafting", brief: { ...item.brief, rewriteInstruction: text } })
      .where(eq(contentItems.id, itemId));
    return { ok: true };
  });
}

/** Write a new version of one post. With no instruction it is a fresh attempt. */
export async function runRewrite(deps: ContentDeps, tenantId: string, itemId: string): Promise<boolean> {
  const loaded = await withTenant(deps.db, tenantId, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, itemId));
    if (!item || item.status !== "drafting") return null;
    const context = await loadBrandContext(tx, tenantId, item.brandId);
    const [latest] = await tx
      .select()
      .from(drafts)
      .where(eq(drafts.contentItemId, itemId))
      .orderBy(desc(drafts.version))
      .limit(1);
    return { item, context, latest: latest ?? null };
  });
  if (!loaded?.context) return false;
  const { rewriteInstruction, ...brief } = loaded.item.brief as unknown as PostBrief & {
    rewriteInstruction?: string;
  };
  return draftOne(
    deps,
    tenantId,
    { ...loaded.item, brief },
    loaded.context,
    loaded.latest && rewriteInstruction
      ? { copy: loaded.latest.copy, instruction: rewriteInstruction }
      : undefined,
    loaded.latest?.assetIds,
  );
}

/**
 * Store the owner's version of a post when it differs from the latest one.
 * Code checks (prices, banned words) run on it too; the owner sees the result.
 */
async function saveOwnerVersion(
  tx: TenantTx,
  tenantId: string,
  item: { id: string; brandId: string },
  copy: string,
  assetId: string | null,
): Promise<{ changed: boolean; flags: ReviewFlag[] }> {
  const [latest] = await tx
    .select()
    .from(drafts)
    .where(eq(drafts.contentItemId, item.id))
    .orderBy(desc(drafts.version))
    .limit(1);
  const assetIds = assetId ? [assetId] : [];
  if (latest && latest.copy === copy && JSON.stringify(latest.assetIds) === JSON.stringify(assetIds)) {
    return { changed: false, flags: latest.reviewFlags };
  }
  if (assetId) {
    const [asset] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.brandId, item.brandId)));
    if (!asset) throw new Error("Unknown asset");
  }
  const context = await loadBrandContext(tx, tenantId, item.brandId);
  const flags = context ? checkCopy(copy, context.profile, context.siteText) : [];
  await tx.insert(drafts).values({
    tenantId,
    brandId: item.brandId,
    contentItemId: item.id,
    version: await nextDraftVersion(tx, item.id),
    copy,
    assetIds,
    source: "user_edit",
    reviewFlags: flags,
  });
  return { changed: true, flags };
}

/** Save the owner's edits and, with `approve`, mark the post approved in the same step. */
export async function saveItem(
  db: Db,
  tenantId: string,
  itemId: string,
  input: { copy: string; assetId: string | null; decision: "save" | "approve" | "reject" },
): Promise<{ ok: true } | { ok: false; error: ItemError }> {
  const copy = input.copy.replace(/\r\n/g, "\n").trim().slice(0, PLAN_LIMITS.caption + 300);
  return withTenant(db, tenantId, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, itemId));
    if (!item) return { ok: false, error: "not_found" };
    // An approved post can be reopened by rejecting or editing it; one being rewritten cannot be touched.
    if (item.status === "drafting") return { ok: false, error: "busy" };
    if (!["needs_approval", "rejected", "failed", "approved"].includes(item.status)) {
      return { ok: false, error: "not_editable" };
    }
    if (input.decision !== "reject") {
      if (!copy) return { ok: false, error: "empty" };
      await saveOwnerVersion(tx, tenantId, item, copy, input.assetId);
    }
    const status =
      input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "needs_approval";
    await tx.update(contentItems).set({ status }).where(eq(contentItems.id, itemId));
    return { ok: true };
  });
}

export interface WeekView {
  plan: typeof plans.$inferSelect;
  items: Array<{
    item: typeof contentItems.$inferSelect;
    brief: PostBrief;
    draft: typeof drafts.$inferSelect | null;
  }>;
  images: Array<{ id: string; url: string; alt: string | null }>;
}

/** The brand's most recent plan with each post's latest draft. */
export async function latestWeek(db: Db, tenantId: string, brandId: string): Promise<WeekView | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [plan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.brandId, brandId))
      .orderBy(desc(plans.weekStart))
      .limit(1);
    if (!plan) return null;
    const items = await tx
      .select()
      .from(contentItems)
      .where(eq(contentItems.planId, plan.id))
      .orderBy(asc(sql`${contentItems.brief}->>'date'`), asc(contentItems.createdAt));
    const latestDrafts =
      items.length === 0
        ? []
        : await tx
            .selectDistinctOn([drafts.contentItemId])
            .from(drafts)
            .where(
              inArray(
                drafts.contentItemId,
                items.map((item) => item.id),
              ),
            )
            .orderBy(drafts.contentItemId, desc(drafts.version));
    const byItem = new Map(latestDrafts.map((draft) => [draft.contentItemId, draft]));
    const images = await tx
      .select({ id: assets.id, url: assets.storageUrl, alt: assets.alt })
      .from(assets)
      .where(and(eq(assets.brandId, brandId), eq(assets.kind, "site_image")))
      .orderBy(asc(assets.createdAt), asc(assets.storageUrl))
      .limit(PLAN_LIMITS.candidateImages);
    return {
      plan,
      items: items.map((item) => ({
        item,
        brief: item.brief as unknown as PostBrief,
        draft: byItem.get(item.id) ?? null,
      })),
      images,
    };
  });
}

/** Status for polling while a plan or a rewrite is running. */
export async function planProgress(db: Db, tenantId: string, brandId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [plan] = await tx
      .select({ id: plans.id, status: plans.status })
      .from(plans)
      .where(eq(plans.brandId, brandId))
      .orderBy(desc(plans.weekStart))
      .limit(1);
    if (!plan) return null;
    const rows = await tx
      .select({ status: contentItems.status, total: sql<number>`count(*)::int` })
      .from(contentItems)
      .where(eq(contentItems.planId, plan.id))
      .groupBy(contentItems.status);
    const count = (status: string) => rows.find((row) => row.status === status)?.total ?? 0;
    return {
      status: plan.status,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      drafting: count("drafting"),
    };
  });
}
