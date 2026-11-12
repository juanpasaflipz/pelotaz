import { and, eq, ne } from "drizzle-orm";
import { after } from "next/server";
import { systemDb } from "@/db/client";
import { brands } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { onboardBrand } from "@/lib/brand-dna/service";
import { createGuardedFetcher } from "@/lib/crawl/fetcher";
import { getLlm } from "@/lib/llm/ai-sdk";

/**
 * Record why a run could not start. A brand that is already `ready` keeps its
 * status: a failed attempt to redo it does not make its existing profile invalid.
 */
async function markFailed(tenantId: string, brandId: string, reason: string) {
  await withTenant(systemDb(), tenantId, (tx) =>
    tx
      .update(brands)
      .set({ status: "failed", statusDetail: reason })
      .where(and(eq(brands.id, brandId), ne(brands.status, "ready"))),
  );
}

/** Run onboarding in this process. Used directly by the internal API route. */
export async function runOnboarding(tenantId: string, brandId: string, force = false) {
  let llm;
  try {
    llm = getLlm();
  } catch {
    // Without this the brand would sit in "pending" with no explanation.
    await markFailed(tenantId, brandId, "llm_not_configured");
    return { state: "failed", reason: "llm_not_configured" } as const;
  }
  return onboardBrand(
    { db: systemDb(), fetcher: createGuardedFetcher(), llm },
    tenantId,
    brandId,
    { force },
  );
}

/**
 * Start onboarding after the current response has been sent.
 *
 * - With `N8N_ONBOARD_WEBHOOK_URL` set, hand the job to n8n, which calls back
 *   into `/api/internal/brands/:id/onboard`. This is the production path: n8n
 *   owns retries and the work is not tied to one request's time limit.
 * - Without it, run in-process. Fine for local development.
 */
export function triggerOnboarding(tenantId: string, brandId: string, force = false) {
  const webhook = process.env.N8N_ONBOARD_WEBHOOK_URL;
  after(async () => {
    try {
      if (webhook) {
        const response = await fetch(webhook, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-pelotaz-secret": process.env.INTERNAL_API_SECRET ?? "",
          },
          body: JSON.stringify({ tenantId, brandId, force }),
        });
        if (!response.ok) throw new Error(`n8n webhook answered ${response.status}`);
      } else {
        await runOnboarding(tenantId, brandId, force);
      }
    } catch (error) {
      console.error("onboarding trigger failed", { brandId, error });
      await markFailed(tenantId, brandId, "trigger_failed").catch(() => {});
    }
  });
}
