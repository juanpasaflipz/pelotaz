"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "@/app/auth/actions";
import { es } from "@/i18n/es";

const initial: AuthFormState = { error: null, email: "" };

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const signingUp = mode === "sign-up";
  const [state, action, pending] = useActionState(signingUp ? signUp : signIn, initial);
  const t = es.auth;

  return (
    <form action={action} className="mt-8 grid max-w-md gap-4">
      {signingUp && (
        <div>
          <label htmlFor="name" className="mb-1.5 block font-semibold">
            {t.name}
          </label>
          <input id="name" name="name" type="text" autoComplete="name" maxLength={120} className="field" />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1.5 block font-semibold">
          {t.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="field"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block font-semibold">
          {t.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          minLength={signingUp ? 8 : undefined}
          aria-describedby={signingUp ? "password-hint" : undefined}
          className="field"
        />
        {signingUp && (
          <p id="password-hint" className="mt-1.5 text-sm opacity-85">
            {t.passwordHint}
          </p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="rounded bg-raya px-3 py-2 font-medium text-chapa">
          {t.errors[state.error]}
        </p>
      )}

      <div>
        <button type="submit" disabled={pending} className="button button-on-wall w-full sm:w-auto">
          {pending ? t.working : signingUp ? t.signUp : t.signIn}
        </button>
      </div>

      <p className="text-sm">
        {signingUp ? t.haveAccount : t.noAccount}{" "}
        <Link href={signingUp ? "/auth/sign-in" : "/auth/sign-up"} className="font-semibold underline underline-offset-4">
          {signingUp ? t.signIn : t.signUp}
        </Link>
      </p>
      {!signingUp && (
        <p className="text-sm">
          <Link href="/auth/olvide" className="underline underline-offset-4">
            {t.forgot}
          </Link>
        </p>
      )}
      {!signingUp && <p className="text-sm opacity-85">{t.justRegistered}</p>}
    </form>
  );
}
