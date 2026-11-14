"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { emailOtp, isNeonAuthConfigured, passwordLinks } from "@/lib/auth/neon";

export type ResetError = "missing" | "weak_password" | "mismatch" | "bad_code" | "rate_limited" | "unavailable";

export interface RequestState {
  /** The code (or link) has been asked for; the form moves to step two. */
  sent: boolean;
  email: string;
  error: ResetError | null;
}

export interface ResetState {
  error: ResetError | null;
}

const field = (formData: FormData, name: string, max: number) =>
  String(formData.get(name) ?? "").trim().slice(0, max);

function log(action: string, error: { code?: string; status?: number; message?: string }) {
  console.error("auth provider error", {
    action,
    code: error.code,
    status: error.status,
    message: error.message?.slice(0, 200),
  });
}

async function siteUrl(): Promise<string> {
  const explicit = process.env.APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/**
 * Step one: send a reset code. The answer is the same whether or not the
 * address has an account, so the form cannot be used to find out who does.
 */
export async function requestReset(_previous: RequestState, formData: FormData): Promise<RequestState> {
  const email = field(formData, "email", 254).toLowerCase();
  if (!email) return { sent: false, email, error: "missing" };
  if (!isNeonAuthConfigured()) return { sent: false, email, error: "unavailable" };

  const { error } = await emailOtp().sendVerificationOtp({ email, type: "forget-password" });
  if (!error) return { sent: true, email, error: null };
  if (error.status === 429) return { sent: false, email, error: "rate_limited" };
  // An unknown address is not news to share.
  if (error.status && error.status < 500 && /user|not.?found/i.test(`${error.code} ${error.message}`)) {
    return { sent: true, email, error: null };
  }

  // Projects set to send links rather than codes.
  log("reset-request-code", error);
  const link = await passwordLinks().requestPasswordReset({ email, redirectTo: `${await siteUrl()}/auth/restablecer` });
  if (link.error) {
    if (link.error.status === 429) return { sent: false, email, error: "rate_limited" };
    if (!link.error.status || link.error.status >= 500) {
      log("reset-request-link", link.error);
      return { sent: false, email, error: "unavailable" };
    }
  }
  return { sent: true, email, error: null };
}

function newPassword(formData: FormData): { password: string } | { error: ResetError } {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!password) return { error: "missing" };
  if (password.length < 8 || password.length > 128) return { error: "weak_password" };
  if (password !== confirm) return { error: "mismatch" };
  return { password };
}

/** Step two: the code from the email and the new password. */
export async function resetWithCode(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const email = field(formData, "email", 254).toLowerCase();
  const otp = field(formData, "code", 12).replace(/\s+/g, "");
  if (!email || !otp) return { error: "missing" };
  const checked = newPassword(formData);
  if ("error" in checked) return { error: checked.error };
  if (!isNeonAuthConfigured()) return { error: "unavailable" };

  const { error } = await emailOtp().resetPassword({ email, otp, password: checked.password });
  if (error) {
    if (error.status === 429) return { error: "rate_limited" };
    if (error.status && error.status < 500) return { error: "bad_code" };
    log("reset-with-code", error);
    return { error: "unavailable" };
  }
  redirect("/auth/sign-in?restablecida=1");
}

/** Step two when the email carried a link: the token from the link and the new password. */
export async function resetWithToken(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const token = field(formData, "token", 512);
  if (!token) return { error: "bad_code" };
  const checked = newPassword(formData);
  if ("error" in checked) return { error: checked.error };
  if (!isNeonAuthConfigured()) return { error: "unavailable" };

  const { error } = await passwordLinks().resetPassword({ newPassword: checked.password, token });
  if (error) {
    if (error.status && error.status < 500) return { error: "bad_code" };
    log("reset-with-token", error);
    return { error: "unavailable" };
  }
  redirect("/auth/sign-in?restablecida=1");
}
