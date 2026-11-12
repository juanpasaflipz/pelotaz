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
import { MARKETS } from "@/lib/markets";

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export interface CreateBrandState {
  error: "invalid_url" | "private_url" | "invalid_input" | null;
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

  const brandId = await withTenant(systemDb(), session.tenantId, async (tx) => {
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
    return row.id;
  });

  triggerOnboarding(session.tenantId, brandId);
  redirect(`/brands/${brandId}`);
}

export type SaveProfileResult =
  | { ok: true; version: number }
  | { ok: false; error: "invalid"; issues: Array<{ path: string; message: string }> }
  | { ok: false; error: "not_found" };

export async function saveProfile(brandId: string, profile: unknown): Promise<SaveProfileResult> {
  const session = await requireSession();
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

/** Start onboarding again: after a failure, or (`recrawl`) to rebuild from the live site. */
export async function restartOnboarding(brandId: string, recrawl: boolean): Promise<void> {
  const session = await requireSession();
  // Reset to "pending" now so the page shows progress immediately; the run
  // itself claims the brand from that state.
  const restartable = recrawl ? (["failed", "ready"] as const) : (["failed"] as const);
  const reset = await withTenant(systemDb(), session.tenantId, (tx) =>
    tx
      .update(brands)
      .set({ status: "pending", statusDetail: null })
      .where(and(eq(brands.id, brandId), inArray(brands.status, [...restartable])))
      .returning({ id: brands.id }),
  );
  if (reset.length > 0) triggerOnboarding(session.tenantId, brandId);
  refresh();
}
