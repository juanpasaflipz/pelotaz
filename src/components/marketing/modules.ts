import type { es } from "@/i18n/es";

/**
 * Every module on the public page and its status today. Set these from the
 * repo on the day the page ships, never from a plan: a module is `beta` only
 * when a beta user can use it, `building` only when code for it exists, and
 * `soon` otherwise.
 *
 * As of 2026-11-16:
 * - profile, plan, drafts: live in the beta (src/lib/brand-dna, src/lib/content).
 * - publishing: built (src/lib/publishing), waiting on Meta App Review.
 * - video, animatedAds: the Remotion kit exists (PR #12, video/), not in the app yet.
 * - whatsapp, results, google: planned for Sprints 2–4; no code yet.
 */
export type ModuleStatus = "beta" | "building" | "soon";
export type ModuleId = keyof typeof es.marketing.modules.items;

export const MODULES: { id: ModuleId; status: ModuleStatus }[] = [
  { id: "profile", status: "beta" },
  { id: "plan", status: "beta" },
  { id: "drafts", status: "beta" },
  { id: "publishing", status: "building" },
  { id: "whatsapp", status: "soon" },
  { id: "results", status: "soon" },
  { id: "google", status: "soon" },
  { id: "video", status: "building" },
  { id: "animatedAds", status: "building" },
  { id: "aiSearch", status: "soon" },
  { id: "customerMessages", status: "soon" },
  { id: "ads", status: "soon" },
  { id: "page", status: "soon" },
  { id: "delivery", status: "soon" },
  { id: "report", status: "soon" },
];

export function statusOf(id: ModuleId): ModuleStatus {
  const found = MODULES.find((module) => module.id === id);
  if (!found) throw new Error(`Unknown module ${id}`);
  return found.status;
}

/** What each plan lists, tied to a module so its chip always matches the wall. */
export const PLAN_FEATURES = {
  beta: [
    { feature: "profile", module: "profile" },
    { feature: "plan", module: "plan" },
    { feature: "drafts", module: "drafts" },
  ],
  starter: [
    { feature: "publishing", module: "publishing" },
    { feature: "whatsapp", module: "whatsapp" },
    { feature: "google", module: "google" },
    { feature: "report", module: "report" },
  ],
  pro: [
    { feature: "video", module: "video" },
    { feature: "reviews", module: "google" },
    { feature: "results", module: "results" },
    { feature: "customerMessages", module: "customerMessages" },
    { feature: "page", module: "page" },
  ],
} as const satisfies Record<string, { feature: keyof typeof es.marketing.pricing.features; module: ModuleId }[]>;
