"use server";

import { redirect } from "next/navigation";
import { isAllowed, parseAllowlist } from "@/lib/auth/access";
import { classifyAuthError, isOperatorProblem, type AuthError, type ProviderError } from "@/lib/auth/errors";
import { emailOtp, isNeonAuthConfigured, neonAuth } from "@/lib/auth/neon";

export interface AuthFormState {
  error: AuthError | null;
  email: string;
}

function explain(action: "sign-in" | "sign-up", error: ProviderError): AuthError {
  const kind = classifyAuthError(action, error);
  // Code and status only: never the address or anything the person typed.
  if (isOperatorProblem(kind)) {
    // The provider's message describes the failure, not the person; keep it short.
    console.error("auth provider error", {
      action,
      code: error.code,
      status: error.status,
      message: error.message?.slice(0, 200),
    });
  }
  return kind;
}

const field = (formData: FormData, name: string, max: number) =>
  String(formData.get(name) ?? "").trim().slice(0, max);

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email", 254).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "missing", email };
  if (!isNeonAuthConfigured()) return { error: "unavailable", email };

  const { error } = await neonAuth().signIn.email({ email, password });
  if (error) return { error: explain("sign-in", error), email };
  redirect("/");
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email", 254).toLowerCase();
  const name = field(formData, "name", 120);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "missing", email };
  if (password.length < 8) return { error: "weak_password", email };
  if (!isNeonAuthConfigured()) return { error: "unavailable", email };
  // Checked again when the workspace is created; this only saves an
  // uninvited person from making an account they cannot use.
  if (!isAllowed(email, parseAllowlist(process.env.SIGNUP_ALLOWLIST))) {
    return { error: "not_invited", email };
  }

  const { error } = await neonAuth().signUp.email({ email, password, name: name || email });
  if (error) return { error: explain("sign-up", error), email };
  // Signed in already, or sent to sign in after confirming the address,
  // depending on the project's email verification setting.
  redirect("/");
}

export async function signOut(): Promise<void> {
  if (isNeonAuthConfigured()) await neonAuth().signOut();
  redirect("/auth/sign-in");
}

/** The signed-in user as the provider has it now, past the cookie cache. */
async function freshUser(): Promise<{ email: string; emailVerified: boolean } | undefined> {
  const { data } = await neonAuth().getSession({ query: { disableCookieCache: "true" } });
  return (data as { user?: { email: string; emailVerified: boolean } } | null)?.user;
}

/** Send the address-confirmation code again to whoever is signed in. */
export async function resendVerification(): Promise<{ sent: boolean }> {
  if (!isNeonAuthConfigured()) return { sent: false };
  const user = await freshUser();
  const email = user?.email;
  if (!email || user.emailVerified) return { sent: false };
  const { error } = await emailOtp().sendVerificationOtp({ email, type: "email-verification" });
  if (!error) return { sent: true };
  // Projects set to confirm by link instead of code.
  const link = await neonAuth().sendVerificationEmail({ email, callbackURL: "/" });
  return { sent: !link.error };
}

export interface VerifyState {
  error: "missing" | "bad_code" | "unavailable" | null;
}

/** Confirm the signed-in person's address with the code they were emailed. */
export async function verifyEmailCode(_previous: VerifyState, formData: FormData): Promise<VerifyState> {
  const otp = String(formData.get("code") ?? "").replace(/\s+/g, "").slice(0, 12);
  if (!otp) return { error: "missing" };
  if (!isNeonAuthConfigured()) return { error: "unavailable" };
  const user = await freshUser();
  const email = user?.email;
  if (!email) redirect("/auth/sign-in");
  if (!user.emailVerified) {
    const { error } = await emailOtp().verifyEmail({ email, otp });
    if (error) {
      // 4xx: wrong, expired or used up. Anything else is ours to look at.
      if (error.status && error.status < 500) return { error: "bad_code" };
      console.error("auth provider error", { action: "verify-email", code: error.code, status: error.status });
      return { error: "unavailable" };
    }
  }
  redirect("/");
}
