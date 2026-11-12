import { connection } from "next/server";
import { cache } from "react";
import { systemDb } from "@/db/client";
import { parseAllowlist, resolveAccess, type Access } from "./access";
import { isNeonAuthConfigured, neonAuth } from "./neon";

export interface Session {
  tenantId: string;
  userId: string;
  email: string;
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      "No sign-in is configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET, or AUTH_MODE=dev with DEV_TENANT_ID for local development.",
    );
    this.name = "AuthNotConfiguredError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestAccess = Access | { kind: "signed_out" };

/**
 * Who is making this request and what they may reach. The single seam for
 * authentication; everything else asks this module.
 *
 * Memoised per request, so a page that asks in several places looks once.
 *
 * - Neon Auth when its two settings are present. This is the production path.
 * - `AUTH_MODE=dev`: every request acts as one tenant from the environment.
 *   Refuses to run in a production build, where it would hand every visitor
 *   the same tenant.
 */
export const getAccess = cache(async function getAccess(): Promise<RequestAccess> {
  if (isNeonAuthConfigured()) {
    // Reading the session needs the request's cookies. Wait for a real request
    // first: during the build's prerender there is none, and the auth SDK
    // would log an error for every page while it found that out.
    await connection();
    const { data } = await neonAuth().getSession();
    const user = data?.user;
    if (!user) return { kind: "signed_out" };
    return resolveAccess(
      systemDb(),
      { userId: user.id, email: user.email, emailVerified: user.emailVerified, name: user.name },
      {
        allowlist: parseAllowlist(process.env.SIGNUP_ALLOWLIST),
        allowUnverified:
          process.env.AUTH_ALLOW_UNVERIFIED === "true" && process.env.NODE_ENV !== "production",
      },
    );
  }

  if (process.env.AUTH_MODE === "dev" && process.env.NODE_ENV !== "production") {
    const tenantId = process.env.DEV_TENANT_ID;
    if (!tenantId || !UUID.test(tenantId)) throw new AuthNotConfiguredError();
    return { kind: "ok", tenantId, userId: "dev-user", email: "dev@localhost" };
  }
  throw new AuthNotConfiguredError();
});

/** The session when the request may act on a tenant, otherwise null. */
export async function getSession(): Promise<Session | null> {
  const access = await getAccess();
  return access.kind === "ok"
    ? { tenantId: access.tenantId, userId: access.userId, email: access.email }
    : null;
}

/** For pages: like `getAccess`, with "nothing is configured" as a state instead of an exception. */
export async function getAccessOrSetup(): Promise<RequestAccess | { kind: "setup" }> {
  try {
    return await getAccess();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) return { kind: "setup" };
    throw error;
  }
}
