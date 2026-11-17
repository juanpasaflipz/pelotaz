/**
 * The paid plans as shown on the public page. Every price, yearly total and
 * saving on the page is computed from this object, so a price change happens
 * here and nowhere else. Amounts are whole pesos (MXN) before IVA.
 *
 * Paid plans are not open yet: nothing here charges anyone. Billing comes with
 * Stripe in Sprint 5 (see claude/roadmap.md).
 */

export const IVA_RATE = 0.16;

export type PaidPlan = "starter" | "pro";
export type Billing = "anual" | "mensual";

export const PAID_PLANS: PaidPlan[] = ["starter", "pro"];
export const BILLINGS: Billing[] = ["anual", "mensual"];

/** Monthly price before IVA, by billing option. Confirmed by Juan on 2026-11-16. */
export const PRICES: Record<PaidPlan, Record<Billing, number>> = {
  starter: { anual: 299, mensual: 329 },
  pro: { anual: 699, mensual: 779 },
};

const cents = (pesos: number) => Math.round(pesos * 100) / 100;

export interface PriceView {
  /** Per month, before IVA. */
  monthly: number;
  /** Per month, with IVA. */
  monthlyWithIva: number;
  /** One charge a year on the annual plan, before IVA; null on monthly. */
  yearlyCharge: number | null;
  yearlyChargeWithIva: number | null;
  /** What the annual plan saves over twelve monthly payments, before IVA. */
  annualSaving: number;
}

export function priceView(plan: PaidPlan, billing: Billing): PriceView {
  const monthly = PRICES[plan][billing];
  const yearly = PRICES[plan].anual * 12;
  return {
    monthly,
    monthlyWithIva: cents(monthly * (1 + IVA_RATE)),
    yearlyCharge: billing === "anual" ? yearly : null,
    yearlyChargeWithIva: billing === "anual" ? cents(yearly * (1 + IVA_RATE)) : null,
    annualSaving: (PRICES[plan].mensual - PRICES[plan].anual) * 12,
  };
}

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "$3,588" or "$4,162.08". */
export function formatPesos(amount: number): string {
  return pesos.format(amount).replace(/\.00$/, "");
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "starter" || value === "pro";
}

export function isBilling(value: unknown): value is Billing {
  return value === "anual" || value === "mensual";
}
