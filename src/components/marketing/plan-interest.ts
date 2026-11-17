import type { Billing, PaidPlan } from "@/lib/pricing";

/**
 * A paid plan's button tells the access form which plan the visitor wants to
 * hear about. The two live in different sections, so they talk through a
 * window event rather than shared state.
 */
export const PLAN_INTEREST_EVENT = "pelotaz:plan-interest";

export interface PlanInterest {
  plan: PaidPlan;
  billing: Billing;
}

export function choosePlan(interest: PlanInterest) {
  window.dispatchEvent(new CustomEvent<PlanInterest>(PLAN_INTEREST_EVENT, { detail: interest }));
}
