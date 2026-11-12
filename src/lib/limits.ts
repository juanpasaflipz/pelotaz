import { and, count, eq, gt, sql } from "drizzle-orm";
import { brands, jobs } from "@/db/schema";
import type { TenantTx } from "@/db/tenant";

/**
 * Every onboarding run costs a crawl and two model calls, and sign-up is
 * self-service, so each tenant gets a ceiling. These are safety limits for a
 * pilot, not plan entitlements; plan-based limits replace them with billing.
 */
export interface Limits {
  maxBrands: number;
  onboardingsPerDay: number;
}

const positive = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export function limitsFromEnv(): Limits {
  return {
    maxBrands: positive(process.env.MAX_BRANDS_PER_TENANT, 5),
    onboardingsPerDay: positive(process.env.ONBOARDINGS_PER_DAY, 10),
  };
}

export type LimitReached = "brand_limit" | "daily_limit";

/** Serialise limit checks per tenant so two simultaneous requests cannot both slip under the ceiling. */
async function lockTenant(tx: TenantTx, tenantId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`limits:${tenantId}`}))`);
}

async function onboardingsToday(tx: TenantTx): Promise<number> {
  const [row] = await tx
    .select({ runs: count() })
    .from(jobs)
    .where(and(eq(jobs.kind, "onboard"), gt(jobs.createdAt, sql`now() - interval '24 hours'`)));
  return row.runs;
}

/**
 * Check the daily ceiling and, if there is room, record this run. Call inside
 * the same tenant transaction as the change it pays for, so a refused run
 * leaves no trace and an allowed one is always counted.
 */
export async function claimOnboardingRun(
  tx: TenantTx,
  tenantId: string,
  brandId: string,
  limits: Limits,
): Promise<LimitReached | null> {
  await lockTenant(tx, tenantId);
  if ((await onboardingsToday(tx)) >= limits.onboardingsPerDay) return "daily_limit";
  await tx.insert(jobs).values({
    tenantId,
    brandId,
    kind: "onboard",
    idempotencyKey: `onboard:${brandId}:${crypto.randomUUID()}`,
  });
  return null;
}

/** Whether the tenant may add another brand. */
export async function checkBrandLimit(
  tx: TenantTx,
  tenantId: string,
  limits: Limits,
): Promise<LimitReached | null> {
  await lockTenant(tx, tenantId);
  const [row] = await tx.select({ total: count() }).from(brands);
  return row.total >= limits.maxBrands ? "brand_limit" : null;
}
