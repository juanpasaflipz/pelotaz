"use client";

import { useActionState } from "react";
import { createBrand, type CreateBrandState } from "@/app/actions";
import { es } from "@/i18n/es";
import { MARKETS } from "@/lib/markets";

const initial: CreateBrandState = { error: null, url: "" };
const GOALS = ["sales", "followers", "leads", "traffic"] as const;

export function NewBrandForm() {
  const [state, action, pending] = useActionState(createBrand, initial);
  const t = es.form;

  return (
    <form action={action} className="mt-8 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="url" className="mb-1.5 block font-semibold">
          {t.url}
        </label>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.url}
          placeholder={t.urlPlaceholder}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "url-error" : undefined}
          className="field text-lg"
        />
        {state.error && (
          <p id="url-error" role="alert" className="mt-2 rounded bg-raya px-3 py-2 font-medium text-chapa">
            {t.errors[state.error]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="goal" className="mb-1.5 block font-semibold">
          {t.goal}
        </label>
        <select id="goal" name="goal" defaultValue="sales" className="field">
          {GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {es.goals[goal]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="country" className="mb-1.5 block font-semibold">
          {t.country}
        </label>
        <select id="country" name="country" defaultValue="MX" className="field">
          {MARKETS.map((market) => (
            <option key={market.country} value={market.country}>
              {market.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="name" className="mb-1.5 block font-semibold">
          {t.name}
        </label>
        <input id="name" name="name" type="text" maxLength={120} aria-describedby="name-hint" className="field" />
        <p id="name-hint" className="mt-1.5 text-sm opacity-85">
          {t.nameHint}
        </p>
      </div>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="button button-on-wall w-full sm:w-auto">
          {pending ? t.submitting : t.submit}
        </button>
      </div>
    </form>
  );
}
