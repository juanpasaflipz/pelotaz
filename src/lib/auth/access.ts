import { and, asc, eq, sql } from "drizzle-orm";
import { accessRequests, memberships, tenants } from "@/db/schema";
import type { Db } from "@/db/tenant";

/** A signed-in person, as the auth provider describes them. */
export interface Identity {
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface AccessPolicy {
  /**
   * Who may get a workspace: full addresses ("ana@taqueria.mx") or whole
   * domains ("@taqueria.mx"). Empty means anyone who signs up. An approved
   * access request lets its address in as well.
   */
  allowlist: string[];
  /** Local development only. Lets an unverified address in. */
  allowUnverified: boolean;
}

export type Access =
  | { kind: "ok"; tenantId: string; userId: string; email: string }
  | { kind: "unverified"; email: string }
  | { kind: "not_invited"; email: string };

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@"));
  return allowlist.some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}

/**
 * Whether an address may have a workspace: on the allowlist, or holding an
 * access request that an admin approved. Rejecting the request later takes
 * the access away again, since this is asked on every request.
 */
export async function isInvited(db: Pick<Db, "select">, email: string, allowlist: string[]): Promise<boolean> {
  if (isAllowed(email, allowlist)) return true;
  const [approved] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.email, email.trim().toLowerCase()), eq(accessRequests.status, "approved")))
    .limit(1);
  return Boolean(approved);
}

/**
 * Decide what a signed-in person may reach, creating their workspace the
 * first time they are let in.
 *
 * Order matters. Verification comes before the allowlist: an address on the
 * list proves nothing until its owner has shown they control it, otherwise
 * anyone could register an invited person's address and take their place.
 */
export async function resolveAccess(db: Db, identity: Identity, policy: AccessPolicy): Promise<Access> {
  const email = identity.email.trim().toLowerCase();
  if (!identity.emailVerified && !policy.allowUnverified) return { kind: "unverified", email };
  if (!(await isInvited(db, email, policy.allowlist))) return { kind: "not_invited", email };

  const find = (executor: Pick<Db, "select">) =>
    executor
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userId, identity.userId))
      .orderBy(asc(memberships.createdAt))
      .limit(1);

  // This runs on every request, so the common case is one indexed read
  // (two for someone let in by an approved request).
  const [existing] = await find(db);
  if (existing) return { kind: "ok", tenantId: existing.tenantId, userId: identity.userId, email };

  // First visit: create the workspace. Two tabs opening at once must not
  // create two, so take a lock keyed on the user and look again inside it.
  const tenantId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`provision:${identity.userId}`}))`);
    const [raced] = await find(tx);
    if (raced) return raced.tenantId;
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: identity.name?.trim() || email })
      .returning({ id: tenants.id });
    await tx.insert(memberships).values({ tenantId: tenant.id, userId: identity.userId, role: "owner" });
    return tenant.id;
  });
  return { kind: "ok", tenantId, userId: identity.userId, email };
}
