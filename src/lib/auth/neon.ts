import { createNeonAuth, type NeonAuth } from "@neon/auth/next/server";

/** Neon Auth is on when both of its settings are present. */
export function isNeonAuthConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

let instance: NeonAuth | undefined;

/**
 * The Neon Auth server client (managed Better Auth). Users and sessions live
 * in this project's own database under the `neon_auth` schema; Neon runs the
 * auth service. Created on first use so that builds and dev mode do not need
 * the settings.
 */
export function neonAuth(): NeonAuth {
  if (!instance) {
    instance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    });
  }
  return instance;
}

interface ProviderResult {
  error: { code?: string; status?: number; message?: string } | null;
}

/** Email one-time codes. The server client has these endpoints but leaves them untyped. */
export interface EmailOtpApi {
  sendVerificationOtp(args: { email: string; type: "email-verification" | "forget-password" }): Promise<ProviderResult>;
  verifyEmail(args: { email: string; otp: string }): Promise<ProviderResult>;
  resetPassword(args: { email: string; otp: string; password: string }): Promise<ProviderResult>;
}

/** Password reset by emailed link, for projects that send links instead of codes. */
export interface PasswordLinkApi {
  requestPasswordReset(args: { email: string; redirectTo: string }): Promise<ProviderResult>;
  resetPassword(args: { newPassword: string; token: string }): Promise<ProviderResult>;
}

export function passwordLinks(): PasswordLinkApi {
  return neonAuth() as unknown as PasswordLinkApi;
}

export function emailOtp(): EmailOtpApi {
  return (neonAuth() as unknown as { emailOtp: EmailOtpApi }).emailOtp;
}
