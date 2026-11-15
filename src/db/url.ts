/**
 * pg treats sslmode=prefer, require and verify-ca as verify-full today, and
 * warns on every cold start that the next major version will switch them to
 * weaker libpq semantics. Neon's console hands out sslmode=require. Naming
 * verify-full keeps the current, full certificate check and drops the warning.
 */
export function withVerifiedSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}
