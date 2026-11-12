"use server";

import { redirect } from "next/navigation";
import { isAllowed, parseAllowlist } from "@/lib/auth/access";
import { classifyAuthError, isOperatorProblem, type AuthError, type ProviderError } from "@/lib/auth/errors";
import { isNeonAuthConfigured, neonAuth } from "@/lib/auth/neon";

export interface AuthFormState {
  error: AuthError | null;
  email: string;
}

function explain(action: "sign-in" | "sign-up", error: ProviderError): AuthError {
  const kind = classifyAuthError(action, error);
  // Code and status only: never the address or anything the person typed.
  if (isOperatorProblem(kind)) {
    console.error("auth provider error", { action, code: error.code, status: error.status });
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

/** Send the address-confirmation message again to whoever is signed in. */
export async function resendVerification(): Promise<{ sent: boolean }> {
  if (!isNeonAuthConfigured()) return { sent: false };
  const { data } = await neonAuth().getSession();
  const email = data?.user?.email;
  if (!email || data.user.emailVerified) return { sent: false };
  const { error } = await neonAuth().sendVerificationEmail({ email, callbackURL: "/" });
  return { sent: !error };
}
