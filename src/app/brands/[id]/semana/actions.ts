"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { systemDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import {
  contentLimitsFromEnv,
  requestPlan,
  publishNow,
  requestRewrite,
  saveItem,
  type ItemError,
} from "@/lib/content/service";
import { triggerPlan, triggerRewrite } from "@/lib/content/trigger";
import { isUuid } from "@/lib/ids";
import { ProfileValidationError } from "@/lib/brand-dna/service";
import { decideProposal, proposeFromEdits } from "@/lib/learning/service";
import { getLlm } from "@/lib/llm/ai-sdk";
import { isPublishingConfigured, publishDeps } from "@/lib/publishing/runtime";
import { chooseFacebookPage, disconnectMeta, publishDue } from "@/lib/publishing/service";

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
  input: { copy: string; assetId: string | null; decision: "save" | "approve" | "reject"; publishTime?: string },
): Promise<ItemActionResult> {
  const session = await requireSession();
  if (!isUuid(itemId) || (input.assetId !== null && !isUuid(input.assetId))) {
    return { ok: false, error: "invalid" };
  }
  if (!["save", "approve", "reject"].includes(input.decision) || typeof input.copy !== "string") {
    return { ok: false, error: "invalid" };
  }
  try {
    const result = await saveItem(systemDb(), session.tenantId, itemId, {
      ...input,
      publishTime: typeof input.publishTime === "string" ? input.publishTime : undefined,
    });
    refresh();
    return result.ok ? { ok: true } : result;
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

export type LearnActionResult =
  | { ok: true; state: "proposed" | "nothing_to_learn" }
  | { ok: false; error: "daily_limit" | "no_profile" | "invalid" | "model" };

/** Read the owner's edits and propose profile changes. One model call; waits for it. */
export async function learnAction(brandId: string): Promise<LearnActionResult> {
  const session = await requireSession();
  if (!isUuid(brandId)) return { ok: false, error: "invalid" };
  try {
    const outcome = await proposeFromEdits(systemDb(), getLlm(), session.tenantId, brandId, contentLimitsFromEnv());
    refresh();
    if (outcome.state === "proposed" || outcome.state === "nothing_to_learn") return { ok: true, state: outcome.state };
    return { ok: false, error: outcome.state };
  } catch (error) {
    console.error("learning failed", { brandId, error: error instanceof Error ? error.message : error });
    return { ok: false, error: "model" };
  }
}

export type DecideActionResult =
  | { ok: true; state: "applied"; version: number; skipped: number }
  | { ok: true; state: "dismissed" }
  | { ok: false; error: "not_found" | "invalid" | "profile" };

export async function decideProposalAction(
  brandId: string,
  suggestionId: string,
  decision: number[] | "dismiss",
): Promise<DecideActionResult> {
  const session = await requireSession();
  if (!isUuid(brandId) || !isUuid(suggestionId)) return { ok: false, error: "invalid" };
  if (decision !== "dismiss" && (!Array.isArray(decision) || decision.some((n) => !Number.isInteger(n)))) {
    return { ok: false, error: "invalid" };
  }
  try {
    const outcome = await decideProposal(
      systemDb(),
      session.tenantId,
      brandId,
      suggestionId,
      decision === "dismiss" ? "dismiss" : { apply: decision },
    );
    refresh();
    if (outcome.state === "applied") return { ok: true, state: "applied", version: outcome.version, skipped: outcome.skipped };
    if (outcome.state === "dismissed") return { ok: true, state: "dismissed" };
    return { ok: false, error: "not_found" };
  } catch (error) {
    if (error instanceof ProfileValidationError) return { ok: false, error: "profile" };
    throw error;
  }
}

export async function publishNowAction(itemId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!isUuid(itemId) || !isPublishingConfigured()) return { ok: false };
  const moved = await publishNow(systemDb(), session.tenantId, itemId);
  if (moved) {
    after(async () => {
      await publishDue(publishDeps()).catch((error) =>
        console.error("publish now failed", { itemId, error: error instanceof Error ? error.message : error }),
      );
    });
  }
  refresh();
  return { ok: moved };
}

export async function chooseMetaPageAction(brandId: string, connectionId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!isUuid(brandId) || !isUuid(connectionId)) return { ok: false };
  const ok = await chooseFacebookPage(systemDb(), session.tenantId, brandId, connectionId);
  refresh();
  return { ok };
}

export async function disconnectMetaAction(brandId: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  if (!isUuid(brandId)) return { ok: false };
  await disconnectMeta(systemDb(), session.tenantId, brandId);
  refresh();
  return { ok: true };
}
