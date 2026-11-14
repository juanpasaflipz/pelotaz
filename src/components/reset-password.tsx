"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  requestReset,
  resetWithCode,
  resetWithToken,
  type RequestState,
  type ResetState,
} from "@/app/auth/reset-actions";
import { es } from "@/i18n/es";

const t = es.auth;

function NewPasswordFields() {
  return (
    <>
      <div>
        <label htmlFor="password" className="mb-1.5 block font-semibold">
          {t.newPassword}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="password-hint"
          className="field"
        />
        <p id="password-hint" className="mt-1.5 text-sm opacity-85">
          {t.passwordHint}
        </p>
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1.5 block font-semibold">
          {t.confirmPassword}
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" />
      </div>
    </>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded bg-raya px-3 py-2 font-medium text-chapa">
      {t.resetErrors[error]}
    </p>
  ) : null;
}

/** Forgot password: email → code and new password. */
export function ResetWithCode() {
  const [request, ask, asking] = useActionState<RequestState, FormData>(requestReset, {
    sent: false,
    email: "",
    error: null,
  });
  const [reset, save, saving] = useActionState<ResetState, FormData>(resetWithCode, { error: null });
  // "Use another address" sets aside the current answer; a new request replaces it.
  const [dismissed, setDismissed] = useState<RequestState | null>(null);
  const sent = request.sent && request !== dismissed;

  if (!sent) {
    return (
      <form action={ask} className="mt-8 grid max-w-md gap-4">
        <p>{t.resetLead}</p>
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
            defaultValue={request.email}
            className="field"
          />
        </div>
        <ErrorLine error={request.error} />
        <div>
          <button type="submit" disabled={asking} className="button button-on-wall w-full sm:w-auto">
            {asking ? t.working : t.resetSend}
          </button>
        </div>
        <p className="text-sm">
          <Link href="/auth/sign-in" className="font-semibold underline underline-offset-4">
            {t.signIn}
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form action={save} className="mt-8 grid max-w-md gap-4">
      <p role="status">{t.resetSent(request.email)}</p>
      <input type="hidden" name="email" value={request.email} />
      <div>
        <label htmlFor="code" className="mb-1.5 block font-semibold">
          {t.resetCode}
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={12}
          className="field w-48 text-lg tracking-widest"
        />
      </div>
      <NewPasswordFields />
      <ErrorLine error={reset.error} />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={saving} className="button button-on-wall">
          {saving ? t.working : t.resetSave}
        </button>
        <button type="button" className="text-sm underline underline-offset-4" onClick={() => setDismissed(request)}>
          {t.resetOther}
        </button>
      </div>
    </form>
  );
}

/** Reset from an emailed link: the token is in the address. */
export function ResetWithToken({ token }: { token: string }) {
  const [state, save, saving] = useActionState<ResetState, FormData>(resetWithToken, { error: null });
  return (
    <form action={save} className="mt-8 grid max-w-md gap-4">
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields />
      <ErrorLine error={state.error} />
      <div>
        <button type="submit" disabled={saving} className="button button-on-wall w-full sm:w-auto">
          {saving ? t.working : t.resetSave}
        </button>
      </div>
    </form>
  );
}
