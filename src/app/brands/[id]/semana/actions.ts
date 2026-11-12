"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { systemDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import {
  contentLimitsFromEnv,
  requestPlan,
  requestRewrite,
  saveItem,
  type ItemError,
} from "@/lib/content/service";
import { triggerPlan, triggerRewrite } from "@/lib/content/trigger";
import { isUuid } from "@/lib/ids";

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export type PlanActionResult =
  | { ok: true }
  | { ok: false; error: "has_approved" | "not_ready" | "daily_limit" };

/** Plan next week for a brand, or plan it again. */
export async function planWeekAction(brandId: string): Promise<PlanActionResult> {
  const session = await requireSession();
  if (!isUuid(brandId)) return { ok: false, error: "not_ready" };
  const result = await requestPlan(systemDb(), session.tenantId, brandId, contentLimitsFromEnv());
  if (result.state === "started") triggerPlan(session.tenantId, result.planId);
  refresh();
  if (result.state === "started" || result.state === "running") return { ok: true };
  return { ok: false, error: result.state };
}

export type ItemActionResult = { ok: true } | { ok: false; error: ItemError | "invalid" };

export async function saveDraftAction(
  itemId: string,
  input: { copy: string; assetId: string | null; decision: "save" | "approve" | "reject" },
): Promise<ItemActionResult> {
  const session = await requireSession();
  if (!isUuid(itemId) || (input.assetId !== null && !isUuid(input.assetId))) {
    return { ok: false, error: "invalid" };
  }
  if (!["save", "approve", "reject"].includes(input.decision) || typeof input.copy !== "string") {
    return { ok: false, error: "invalid" };
  }
  try {
    const result = await saveItem(systemDb(), session.tenantId, itemId, input);
    refresh();
    return result;
  } catch {
    // An asset id that is not this brand's photo.
    return { ok: false, error: "invalid" };
  }
}

export async function rewriteAction(itemId: string, instruction: string): Promise<ItemActionResult> {
  const session = await requireSession();
  if (!isUuid(itemId) || typeof instruction !== "string") return { ok: false, error: "invalid" };
  const result = await requestRewrite(systemDb(), session.tenantId, itemId, instruction, contentLimitsFromEnv());
  if (result.ok) triggerRewrite(session.tenantId, itemId);
  refresh();
  return result;
}
