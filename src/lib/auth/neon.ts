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
