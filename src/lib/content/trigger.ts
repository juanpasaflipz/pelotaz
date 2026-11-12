import { after } from "next/server";
import { eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { contentItems, plans } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { getCriticLlm, getLlm } from "@/lib/llm/ai-sdk";
import { runPlan, runRewrite } from "./service";

/**
 * Plan and rewrite runs happen after the response is sent, in this process.
 * A full week is one planning call and two calls per post, three posts at a
 * time; it fits in the page's time limit. If it is cut off, the plan is
 * stale after ten minutes and asking again restarts it.
 */
function deps() {
  return { db: systemDb(), llm: getLlm(), critic: getCriticLlm() };
}

export function triggerPlan(tenantId: string, planId: string) {
  after(async () => {
    try {
      await runPlan(deps(), tenantId, planId);
    } catch (error) {
      console.error("plan trigger failed", { planId, error: error instanceof Error ? error.message : error });
      const reason = error instanceof Error && error.name === "LlmNotConfiguredError" ? "llm_not_configured" : "internal_error";
      await withTenant(systemDb(), tenantId, (tx) =>
        tx.update(plans).set({ status: "failed", statusDetail: reason }).where(eq(plans.id, planId)),
      ).catch(() => {});
    }
  });
}

export function triggerRewrite(tenantId: string, itemId: string) {
  after(async () => {
    try {
      await runRewrite(deps(), tenantId, itemId);
    } catch (error) {
      console.error("rewrite trigger failed", { itemId, error: error instanceof Error ? error.message : error });
      // Back to review: the previous version is still there.
      await withTenant(systemDb(), tenantId, (tx) =>
        tx.update(contentItems).set({ status: "needs_approval" }).where(eq(contentItems.id, itemId)),
      ).catch(() => {});
    }
  });
}
