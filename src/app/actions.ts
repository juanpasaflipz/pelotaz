"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { systemDb } from "@/db/client";
import { brands } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { goalSchema } from "@/lib/brand-dna/schema";
import { ProfileValidationError, saveProfileEdit } from "@/lib/brand-dna/service";
import { getSession } from "@/lib/auth/session";
import { siteKey } from "@/lib/crawl/discover";
import { parsePublicUrl, UnsafeUrlError } from "@/lib/crawl/url-guard";
import { triggerOnboarding } from "@/lib/onboarding/trigger";
import { isUuid } from "@/lib/ids";
import { checkBrandLimit, claimOnboardingRun, limitsFromEnv, type LimitReached } from "@/lib/limits";
import { MARKETS } from "@/lib/markets";

class LimitError extends Error {
  constructor(public readonly limit: LimitReached) {
    super(limit);
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export interface CreateBrandState {
  error: "invalid_url" | "private_url" | "invalid_input" | LimitReached | null;
  url: string;
}

export async function createBrand(
  _previous: CreateBrandState,
  formData: FormData,
): Promise<CreateBrandState> {
  const session = await requireSession();
  const rawUrl = String(formData.get("url") ?? "").slice(0, 2_000);
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);

  const goal = goalSchema.safeParse(formData.get("goal"));
  const market = MARKETS.find((m) => m.country === formData.get("country"));
  if (!goal.success || !market) return { error: "invalid_input", url: rawUrl };

  let url: URL;
  try {
    // Same check the crawler applies, run here so the person gets an answer immediately.
    url = parsePublicUrl(rawUrl);
  } catch (error) {
    if (!(error instanceof UnsafeUrlError)) throw error;
    const typo = error.reason === "invalid_url" || error.reason === "unsupported_scheme";
    return { error: typo ? "invalid_url" : "private_url", url: rawUrl };
  }

  const limits = limitsFromEnv();
  let brandId: string;
  try {
    brandId = await withTenant(systemDb(), session.tenantId, async (tx) => {
      const full = await checkBrandLimit(tx, session.tenantId, limits);
      if (full) throw new LimitError(full);
      const [row] = await tx
        .insert(brands)
        .values({
          tenantId: session.tenantId,
          // With no name given, use the hostname; onboarding replaces it with the site's own name.
          name: name || siteKey(url),
          sourceUrl: url.toString(),
          goal: goal.data,
          country: market.country,
          locale: market.locale,
        })
        .returning({ id: brands.id });
      const spent = await claimOnboardingRun(tx, session.tenantId, row.id, limits);
      // Throwing rolls the brand back too: no half-created brand that can never be read.
      if (spent) throw new LimitError(spent);
      return row.id;
    });
  } catch (error) {
    if (error instanceof LimitError) return { error: error.limit, url: rawUrl };
    throw error;
  }

  triggerOnboarding(session.tenantId, brandId);
  redirect(`/brands/${brandId}`);
}

export type SaveProfileResult =
  | { ok: true; version: number }
  | { ok: false; error: "invalid"; issues: Array<{ path: string; message: string }> }
  | { ok: false; error: "not_found" };

export async function saveProfile(brandId: string, profile: unknown): Promise<SaveProfileResult> {
  const session = await requireSession();
  if (!isUuid(brandId)) return { ok: false, error: "not_found" };
  try {
    const saved = await saveProfileEdit(systemDb(), session.tenantId, brandId, profile);
    if (!saved) return { ok: false, error: "not_found" };
    refresh();
    return { ok: true, version: saved.version };
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return { ok: false, error: "invalid", issues: error.issues };
    }
    throw error;
  }
}

export type RestartResult = { ok: true } | { ok: false; error: LimitReached };

/** Start onboarding again: after a failure, or (`recrawl`) to rebuild from the live site. */
export async function restartOnboarding(brandId: string, recrawl: boolean): Promise<RestartResult> {
  const session = await requireSession();
  if (!isUuid(brandId)) return { ok: true };
  const limits = limitsFromEnv();
  const restartable = recrawl ? (["failed", "ready"] as const) : (["failed"] as const);

  let started = false;
  try {
    started = await withTenant(systemDb(), session.tenantId, async (tx) => {
      // Reset to "pending" now so the page shows progress immediately; the
      // run itself claims the brand from that state.
      const reset = await tx
        .update(brands)
        .set({ status: "pending", statusDetail: null })
        .where(and(eq(brands.id, brandId), inArray(brands.status, [...restartable])))
        .returning({ id: brands.id });
      if (reset.length === 0) return false;
      const spent = await claimOnboardingRun(tx, session.tenantId, brandId, limits);
      if (spent) throw new LimitError(spent);
      return true;
    });
  } catch (error) {
    if (error instanceof LimitError) return { ok: false, error: error.limit };
    throw error;
  }
  if (started) triggerOnboarding(session.tenantId, brandId);
  refresh();
  return { ok: true };
}
