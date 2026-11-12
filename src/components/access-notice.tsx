"use client";

import { useActionState, useState, useTransition } from "react";
import { resendVerification, verifyEmailCode, type VerifyState } from "@/app/auth/actions";
import { es } from "@/i18n/es";

/** Shown in place of data to someone who is signed in but may not use a workspace yet. */
export function AccessNotice({ kind, email }: { kind: "unverified" | "not_invited"; email: string }) {
  const t = es.auth;
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [state, verify, verifying] = useActionState<VerifyState, FormData>(verifyEmailCode, { error: null });

  return (
    <div className="mt-6 max-w-prose border-l-4 border-pelota bg-raya px-5 py-4">
      <p className="display text-2xl">{kind === "unverified" ? t.unverifiedTitle : t.notInvitedTitle}</p>
      <p className="mt-1">{kind === "unverified" ? t.unverifiedBody(email) : t.notInvitedBody(email)}</p>
      {kind === "unverified" && (
        <form action={verify} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t.code}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={12}
              className="field w-40 text-lg tracking-widest"
            />
          </label>
          <button type="submit" className="button button-primary" disabled={verifying}>
            {verifying ? t.working : t.verify}
          </button>
          {state.error && (
            <p role="alert" className="w-full text-sm text-chapa">
              {t.verifyErrors[state.error]}
            </p>
          )}
        </form>
      )}
      {kind === "unverified" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="button button-quiet"
            disabled={pending}
            onClick={() => startTransition(async () => setSent((await resendVerification()).sent))}
          >
            {t.resend}
          </button>
          <p role="status" aria-live="polite" className="text-sm">
            {sent ? t.resent : ""}
          </p>
        </div>
      )}
    </div>
  );
}
