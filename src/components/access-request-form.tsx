"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { requestAccess, type RequestAccessState } from "@/app/acceso/actions";
import { BallMark } from "@/components/logo";
import { trackEvent } from "@/components/marketing/analytics";
import { PLAN_INTEREST_EVENT, type PlanInterest } from "@/components/marketing/plan-interest";
import { es } from "@/i18n/es";

const initial: RequestAccessState = { error: null, sentTo: null, email: "", businessName: "", website: "" };

const FIELD_OF_ERROR = {
  invalid_email: "email",
  missing_business: "business",
  invalid_url: "website",
  private_url: "website",
  busy: null,
} as const;

const noSubscribe = () => () => {};

function utmFromAddress(): string {
  const found = [...new URLSearchParams(window.location.search)].filter(([key]) => key.startsWith("utm_"));
  return found.length > 0 ? JSON.stringify(Object.fromEntries(found)) : "";
}

/** The public form that asks for a place in the private beta. `source` is the short address the page was opened at. */
export function AccessRequestForm({ source }: { source?: "beta" | "empieza" }) {
  const [state, action, pending] = useActionState(requestAccess, initial);
  const t = es.landing;
  const [interest, setInterest] = useState<PlanInterest | null>(null);
  const started = useRef(false);
  // The visit's utm_* parameters, sent with the request. Empty on the server.
  const utm = useSyncExternalStore(noSubscribe, utmFromAddress, () => "");

  // A paid plan's button on the same page says which plan this request is about.
  useEffect(() => {
    const listen = (event: Event) => setInterest((event as CustomEvent<PlanInterest>).detail);
    window.addEventListener(PLAN_INTEREST_EVENT, listen);
    return () => window.removeEventListener(PLAN_INTEREST_EVENT, listen);
  }, []);

  useEffect(() => {
    if (state.sentTo) trackEvent("form_sent", interest ? { plan: interest.plan, billing: interest.billing } : {});
  }, [state.sentTo, interest]);

  if (state.sentTo && state.approved) {
    return (
      <div role="status" className="mt-6 max-w-md rounded bg-raya px-5 py-4 text-tinta">
        <p className="display flex items-center gap-2 text-2xl">
          <BallMark className="size-5" />
          {t.readyTitle}
        </p>
        <p className="mt-2">{t.ready(state.sentTo)}</p>
        <Link href="/auth/sign-up" className="button button-primary mt-4 inline-block">
          {t.readyCta}
        </Link>
      </div>
    );
  }

  if (state.sentTo) {
    return (
      <div role="status" className="mt-6 max-w-md rounded bg-raya px-5 py-4 text-tinta">
        <p className="display flex items-center gap-2 text-2xl">
          <BallMark className="size-5" />
          {t.sentTitle}
        </p>
        <p className="mt-2">{t.sent(state.sentTo)}</p>
      </div>
    );
  }

  const wrong = state.error ? FIELD_OF_ERROR[state.error] : null;
  const invalid = (name: string) => (wrong === name ? { "aria-invalid": true, "aria-describedby": "access-error" } : {});

  return (
    <form
      action={action}
      className="mt-6 grid max-w-md gap-4"
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        trackEvent("form_start");
      }}
    >
      {interest && (
        <p className="rounded bg-raya px-3 py-2 font-semibold text-marca-profunda">
          {es.marketing.pricing.chosen(
            es.marketing.pricing.plans[interest.plan].name,
            es.marketing.pricing.billing[interest.billing].toLowerCase(),
          )}
        </p>
      )}
      <input type="hidden" name="plan_interest" value={interest?.plan ?? ""} />
      <input type="hidden" name="billing_interest" value={interest?.billing ?? ""} />
      <input type="hidden" name="source" value={source ?? ""} />
      <input type="hidden" name="utm" value={utm} />
      <div>
        <label htmlFor="access-email" className="mb-1.5 block font-semibold">
          {t.email}
        </label>
        <input
          id="access-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.email}
          className="field"
          {...invalid("email")}
        />
      </div>
      <div>
        <label htmlFor="access-business" className="mb-1.5 block font-semibold">
          {t.business}
        </label>
        <input
          id="access-business"
          name="business"
          type="text"
          autoComplete="organization"
          required
          maxLength={120}
          defaultValue={state.businessName}
          className="field"
          {...invalid("business")}
        />
      </div>
      <div>
        <label htmlFor="access-website" className="mb-1.5 block font-semibold">
          {t.website}
        </label>
        <input
          id="access-website"
          name="website"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={2000}
          defaultValue={state.website}
          placeholder={t.websitePlaceholder}
          className="field"
          {...invalid("website")}
        />
      </div>
      {/* Not for people: hidden from sight, from the tab order and from screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="access-fax">Fax</label>
        <input id="access-fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p id="access-error" role="alert" className="rounded bg-raya px-3 py-2 font-medium text-chapa">
          {t.errors[state.error]}
        </p>
      )}

      <div>
        <button type="submit" disabled={pending} className="button button-on-wall w-full sm:w-auto">
          {pending ? t.submitting : t.submit}
        </button>
      </div>
      <p className="text-sm">
        {t.consent}{" "}
        <Link href="/privacidad" className="font-semibold underline underline-offset-4">
          {t.privacy}
        </Link>
      </p>
    </form>
  );
}
