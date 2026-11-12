export interface Session {
  tenantId: string;
  userId: string;
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      "No auth provider is configured. Set AUTH_MODE=dev with DEV_TENANT_ID for local development; production needs a real provider wired into getSession().",
    );
    this.name = "AuthNotConfiguredError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who is making this request, and for which tenant.
 *
 * This is the single seam for authentication. No provider is wired in yet:
 * the only working mode is `AUTH_MODE=dev`, which signs every request in as
 * one tenant from the environment and refuses to run in a production build.
 * When a provider is chosen, verify its session here, look the user up in
 * `memberships`, and return the tenant. Nothing else in the app needs to change.
 */
export async function getSession(): Promise<Session | null> {
  if (process.env.AUTH_MODE === "dev") {
    if (process.env.NODE_ENV === "production") {
      // A deployed app that trusts an environment variable for identity would
      // give every visitor the same tenant. Fail closed instead.
      throw new AuthNotConfiguredError();
    }
    const tenantId = process.env.DEV_TENANT_ID;
    if (!tenantId || !UUID.test(tenantId)) throw new AuthNotConfiguredError();
    return { tenantId, userId: "dev-user" };
  }
  throw new AuthNotConfiguredError();
}

/** For pages: `null` when no auth is configured, so they can show setup instructions. */
export async function getSessionOrNull(): Promise<Session | null> {
  try {
    return await getSession();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) return null;
    throw error;
  }
}
