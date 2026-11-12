/** What the auth provider reports when a call fails. */
export interface ProviderError {
  code?: string;
  status?: number;
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
  | "unavailable";

const ORIGIN_CODES = new Set(["INVALID_ORIGIN", "MISSING_ORIGIN", "MISSING_OR_NULL_ORIGIN"]);

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
  const code = error.code ?? "";
  if (ORIGIN_CODES.has(code)) return "domain_not_trusted";

  if (action === "sign-in") {
    if (code === "EMAIL_NOT_VERIFIED") return "email_not_verified";
    // One message for a wrong address and a wrong password, so the form does
    // not reveal which addresses have accounts.
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_EMAIL" || code === "INVALID_PASSWORD") {
      return "bad_credentials";
    }
    return error.status === 401 ? "bad_credentials" : "unavailable";
  }

  if (code.startsWith("USER_ALREADY_EXISTS")) return "sign_up_failed";
  if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return "weak_password";
  if (code === "INVALID_EMAIL") return "invalid_email";
  return "unavailable";
}

/** Failures that mean something is wrong on our side and should reach the logs. */
export function isOperatorProblem(kind: AuthError): boolean {
  return kind === "domain_not_trusted" || kind === "unavailable";
}
