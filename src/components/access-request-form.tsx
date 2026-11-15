"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestAccess, type RequestAccessState } from "@/app/acceso/actions";
import { BallMark } from "@/components/logo";
import { es } from "@/i18n/es";

const initial: RequestAccessState = { error: null, sentTo: null, email: "", businessName: "", website: "" };

const FIELD_OF_ERROR = {
  invalid_email: "email",
  missing_business: "business",
  invalid_url: "website",
  private_url: "website",
  busy: null,
} as const;

/** The public form that asks for a place in the private beta. */
export function AccessRequestForm() {
  const [state, action, pending] = useActionState(requestAccess, initial);
  const t = es.landing;

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
    <form action={action} className="mt-6 grid max-w-md gap-4">
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
