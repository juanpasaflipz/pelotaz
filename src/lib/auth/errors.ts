/** What the auth provider reports when a call fails. */
export interface ProviderError {
  code?: string;
  status?: number;
  message?: string;
}

export type AuthError =
  | "missing"
  | "weak_password"
  | "invalid_email"
  | "bad_credentials"
  | "email_not_verified"
  | "sign_up_failed"
  | "not_invited"
  | "domain_not_trusted"
  | "rate_limited"
  | "unavailable";

/**
 * The Neon Auth SDK rewrites the provider's codes into its own lowercase set
 * ("invalid_credentials", "weak_password") and passes through any it does not
 * know. Compare case-insensitively and accept both spellings, so a change in
 * that mapping does not silently turn every failure into "unavailable".
 */
const is = (code: string, ...names: string[]) => names.includes(code);

/**
 * Turn a provider failure into the message to show.
 *
 * Only failures that really are about the credentials say so. Everything
 * else (the site's domain not being trusted by the provider, an outage, a
 * misconfigured URL) is reported as what it is: telling someone their
 * password is wrong when the fault is ours sends them to reset a password
 * that was never the problem.
 */
export function classifyAuthError(action: "sign-in" | "sign-up", error: ProviderError): AuthError {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();

  // An untrusted origin has no code of its own in the SDK's set; it arrives
  // as a generic 400/403 whose message names the origin.
  if (code.includes("origin") || message.includes("origin")) return "domain_not_trusted";
  if (error.status === 429 || code.includes("rate_limit")) return "rate_limited";

  if (action === "sign-in") {
    if (is(code, "email_not_confirmed", "email_not_verified")) return "email_not_verified";
    // One message for a wrong address and a wrong password, so the form does
    // not reveal which addresses have accounts. A password under the minimum
    // length is reported as "weak" by the provider; at sign-in that simply
    // means it is not this account's password.
    if (
      is(
        code,
        "invalid_credentials",
        "invalid_email_or_password",
        "invalid_password",
        "invalid_email",
        "email_address_invalid",
        "user_not_found",
        "identity_not_found",
        "weak_password",
        "password_too_short",
        "password_too_long",
      )
    ) {
      return "bad_credentials";
    }
    return error.status === 401 ? "bad_credentials" : "unavailable";
  }

  if (code.startsWith("user_already_exists") || is(code, "email_exists")) return "sign_up_failed";
  if (is(code, "weak_password", "password_too_short", "password_too_long")) return "weak_password";
  if (is(code, "email_address_invalid", "invalid_email")) return "invalid_email";
  return "unavailable";
}

/** Failures that mean something is wrong on our side and should reach the logs. */
export function isOperatorProblem(kind: AuthError): boolean {
  return kind === "domain_not_trusted" || kind === "unavailable";
}
