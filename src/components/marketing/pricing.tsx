"use client";

import { track } from "@vercel/analytics";
import { useState } from "react";
import { es } from "@/i18n/es";
import { BILLINGS, formatPesos, PAID_PLANS, priceView, type Billing, type PaidPlan } from "@/lib/pricing";
import { PLAN_FEATURES, statusOf } from "./modules";
import { choosePlan } from "./plan-interest";
import { StatusChip } from "./status-chip";

const t = es.marketing.pricing;

/** Three plans and an Anual/Mensual switch. Every figure comes from src/lib/pricing.ts. */
export function Pricing() {
  const [billing, setBilling] = useState<Billing>("anual");

  return (
    <>
      <div role="radiogroup" aria-label={t.toggleLabel} className="mt-6 inline-flex rounded-full border-2 border-tinta bg-raya p-1">
        {BILLINGS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={billing === option}
            onClick={() => {
              setBilling(option);
              track("billing_toggle", { billing: option });
            }}
            className={`rounded-full px-5 py-1.5 font-semibold ${billing === option ? "bg-tinta text-raya" : "text-tinta"}`}
          >
            {t.billing[option]}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <PlanCard
          name={t.plans.beta.name}
          forWhom={t.plans.beta.for}
          tag={t.limited}
          price={<p className="display text-4xl">{t.free}</p>}
          includesLabel={t.plans.beta.includesLabel}
          features={PLAN_FEATURES.beta}
          button={
            <a href="#acceso" onClick={() => track("plan_button", { plan: "beta" })} className="button button-primary w-full">
              {t.plans.beta.button}
            </a>
          }
        />
        {PAID_PLANS.map((plan) => (
          <PaidCard key={plan} plan={plan} billing={billing} />
        ))}
      </div>
    </>
  );
}

function PaidCard({ plan, billing }: { plan: PaidPlan; billing: Billing }) {
  const copy = t.plans[plan];
  const view = priceView(plan, billing);
  return (
    <PlanCard
      name={copy.name}
      forWhom={copy.for}
      tag={t.launch}
      highlight={plan === "pro"}
      price={
        <>
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="display text-4xl">{formatPesos(view.monthly)}</span>
            <span className="font-semibold">MXN {t.perMonth}</span>
            <span className="font-semibold">{t.plusIva}</span>
          </p>
          <p className="mt-1 min-h-10 text-sm text-tinta-suave">
            {view.yearlyCharge !== null ? t.yearly(formatPesos(view.yearlyCharge)) : t.saving(formatPesos(view.annualSaving))}
          </p>
        </>
      }
      includesLabel={copy.includesLabel}
      features={PLAN_FEATURES[plan]}
      button={
        <a
          href="#acceso"
          onClick={() => {
            choosePlan({ plan, billing });
            track("plan_button", { plan, billing });
          }}
          className={`button w-full ${plan === "pro" ? "button-primary" : "button-quiet"}`}
        >
          {copy.button}
        </a>
      }
    />
  );
}

function PlanCard(props: {
  name: string;
  forWhom: string;
  tag: string;
  price: React.ReactNode;
  includesLabel: string;
  features: readonly { feature: keyof typeof t.features; module: Parameters<typeof statusOf>[0] }[];
  button: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <article className={`flex flex-col rounded-xl bg-raya p-5 ${props.highlight ? "border-4 border-marca" : "border-2 border-borde"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-marca-profunda">{props.tag}</p>
      <h3 className="display mt-1 text-3xl">{props.name}</h3>
      <p className="mt-1 min-h-12 text-tinta-suave">{props.forWhom}</p>
      <div className="mt-3">{props.price}</div>
      <p className="mt-4 text-sm font-semibold">{props.includesLabel}</p>
      <ul className="mt-2 grid flex-1 gap-2">
        {props.features.map(({ feature, module }) => {
          const status = statusOf(module);
          return (
            <li key={feature} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t.features[feature]}</span>
              {status !== "beta" && <StatusChip status={status} />}
            </li>
          );
        })}
      </ul>
      <div className="mt-5">{props.button}</div>
    </article>
  );
}
