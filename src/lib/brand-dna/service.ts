import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { es as zodEs } from "zod/locales";
import { brandDna, brands, crawlPages } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { CrawlError, crawlSite } from "@/lib/crawl/crawl";
import { siteKey } from "@/lib/crawl/discover";
import { FetchRejectedError } from "@/lib/crawl/fetcher";
import type { CrawlResult, PageFetcher } from "@/lib/crawl/types";
import { UnsafeUrlError } from "@/lib/crawl/url-guard";
import type { Llm } from "@/lib/llm/types";
import { buildBrandDna } from "./build";
import { brandDnaProfileSchema, normalizeDraft, type BrandDnaProfile } from "./schema";

export interface OnboardingDeps {
  db: Db;
  fetcher: PageFetcher;
  llm: Llm;
}

/** Why onboarding stopped, as stored in `brands.status_detail`. The UI maps these to copy. */
export type OnboardingFailure =
  | "unsafe_url"
  | "home_unreachable"
  | "home_not_html"
  | "blocked_by_robots"
  | "thin_content"
  | "llm_error"
  | "internal_error";

export type OnboardingOutcome =
  | { state: "ready"; version: number }
  | { state: "failed"; reason: OnboardingFailure }
  | { state: "skipped"; reason: "not_found" | "already_running" | "already_ready" };

/** Below this much text across all pages there is nothing to build a profile from. */
const MIN_TEXT_CHARS = 400;
/** A run that has not finished after this long is assumed dead and may be restarted. */
const STALE_AFTER_MINUTES = 10;

function failureOf(error: unknown): OnboardingFailure {
  if (error instanceof UnsafeUrlError) return "unsafe_url";
  if (error instanceof CrawlError) return error.reason;
  if (error instanceof FetchRejectedError) return "home_unreachable";
  return "internal_error";
}

/**
 * Crawl a brand's site and write Brand DNA version 1 (or the next version on
 * a re-run). Safe to trigger more than once: the first statement claims the
 * brand row, and a second caller gets `skipped`.
 *
 * Each database step is its own short tenant transaction; the crawl and the
 * model calls happen between them with no transaction open.
 */
export async function onboardBrand(
  deps: OnboardingDeps,
  tenantId: string,
  brandId: string,
  options: { force?: boolean } = {},
): Promise<OnboardingOutcome> {
  const { db, fetcher, llm } = deps;

  const claim = await withTenant(db, tenantId, async (tx) => {
    const startable = options.force
      ? (["pending", "failed", "ready"] as const)
      : (["pending", "failed"] as const);
    const [claimed] = await tx
      .update(brands)
      .set({ status: "crawling", statusDetail: null })
      .where(
        and(
          eq(brands.id, brandId),
          or(
            inArray(brands.status, [...startable]),
            and(
              inArray(brands.status, ["crawling", "building"]),
              lt(brands.updatedAt, sql`now() - make_interval(mins => ${STALE_AFTER_MINUTES})`),
            ),
          ),
        ),
      )
      .returning();
    if (claimed) return { claimed: true as const, brand: claimed };
    const [existing] = await tx.select().from(brands).where(eq(brands.id, brandId));
    const reason = !existing
      ? ("not_found" as const)
      : existing.status === "ready"
        ? ("already_ready" as const)
        : ("already_running" as const);
    return { claimed: false as const, reason };
  });
  if (!claim.claimed) return { state: "skipped", reason: claim.reason };
  const brand = claim.brand;

  const fail = async (reason: OnboardingFailure): Promise<OnboardingOutcome> => {
    await withTenant(db, tenantId, (tx) =>
      tx.update(brands).set({ status: "failed", statusDetail: reason }).where(eq(brands.id, brandId)),
    );
    return { state: "failed", reason };
  };

  let crawl: CrawlResult;
  try {
    crawl = await crawlSite(fetcher, brand.sourceUrl);
  } catch (error) {
    return fail(failureOf(error));
  }
  if (crawl.totalTextLength < MIN_TEXT_CHARS) return fail("thin_content");

  try {
    await withTenant(db, tenantId, async (tx) => {
      await tx.delete(crawlPages).where(eq(crawlPages.brandId, brandId));
      await tx.insert(crawlPages).values(
        crawl.pages.map((page) => ({
          tenantId,
          brandId,
          url: page.url,
          title: page.title,
          text: page.text,
          // Raw CSS is only needed to compute the palette; do not store it per page.
          assets: { ...page.assets, inlineCss: "" },
          httpStatus: page.status,
        })),
      );
      await tx.update(brands).set({ status: "building" }).where(eq(brands.id, brandId));
    });
  } catch {
    return fail("internal_error");
  }

  let built;
  try {
    built = await buildBrandDna(llm, crawl, {
      goal: brand.goal,
      country: brand.country,
      locale: brand.locale,
    });
  } catch {
    return fail("llm_error");
  }

  try {
    const version = await withTenant(db, tenantId, async (tx) => {
      const next = await nextVersion(tx, brandId);
      await tx.insert(brandDna).values({
        tenantId,
        brandId,
        version: next,
        profile: built.profile,
        source: "crawl",
        reviewFlags: built.reviewFlags,
        llmUsage: built.usage,
      });
      // If the brand was created with only a URL, its name is still the
      // hostname placeholder; replace it with what the site calls itself.
      const placeholder = brand.name === siteKey(brand.sourceUrl);
      await tx
        .update(brands)
        .set({
          status: "ready",
          statusDetail: null,
          ...(placeholder && built.profile.business.name
            ? { name: built.profile.business.name }
            : {}),
        })
        .where(eq(brands.id, brandId));
      return next;
    });
    return { state: "ready", version };
  } catch {
    return fail("internal_error");
  }
}

type Tx = Parameters<Parameters<typeof withTenant>[2]>[0];

async function nextVersion(tx: Tx, brandId: string): Promise<number> {
  const [row] = await tx
    .select({ latest: sql<number | null>`max(${brandDna.version})` })
    .from(brandDna)
    .where(eq(brandDna.brandId, brandId));
  return (row?.latest ?? 0) + 1;
}

export async function latestBrandDna(db: Db, tenantId: string, brandId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(brandDna)
      .where(eq(brandDna.brandId, brandId))
      .orderBy(desc(brandDna.version))
      .limit(1);
    return row ?? null;
  });
}

export class ProfileValidationError extends Error {
  constructor(public readonly issues: Array<{ path: string; message: string }>) {
    super("The profile is not valid");
    this.name = "ProfileValidationError";
  }
}

/**
 * Save a person's edit as a new version. Versions are never overwritten, so
 * any earlier profile can be restored. The edit also clears the automatic
 * review flags: a person has now read and vouched for the content.
 */
export async function saveProfileEdit(
  db: Db,
  tenantId: string,
  brandId: string,
  input: unknown,
): Promise<{ version: number } | null> {
  // The person editing reads Spanish; report what is wrong in Spanish.
  const parsed = brandDnaProfileSchema.safeParse(input, { error: zodEs().localeError });
  if (!parsed.success) {
    throw new ProfileValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  const { visual, goal, country, locale, ...draft } = parsed.data;
  const profile: BrandDnaProfile = {
    ...normalizeDraft(draft),
    visual: { ...visual, palette: visual.palette.map((hex) => hex.toLowerCase()) },
    goal,
    country: country.toUpperCase(),
    locale,
  };

  return withTenant(db, tenantId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId));
    if (!brand) return null;
    const version = await nextVersion(tx, brandId);
    await tx.insert(brandDna).values({
      tenantId,
      brandId,
      version,
      profile,
      source: "user_edit",
      reviewFlags: [],
    });
    // Goal, market and locale live on the brand row; keep it in step.
    await tx
      .update(brands)
      .set({ goal: profile.goal, country: profile.country, locale: profile.locale })
      .where(eq(brands.id, brandId));
    return { version };
  });
}
