import { desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { accessRequests } from "@/db/schema";
import type { Db } from "@/db/tenant";
import { parsePublicUrl, UnsafeUrlError } from "@/lib/crawl/url-guard";
import { isBilling, isPaidPlan, type Billing, type PaidPlan } from "@/lib/pricing";

/**
 * Requests to join the private beta, made from the public page and decided
 * by an admin. An approved request lets that address create a workspace (see
 * `isInvited` in src/lib/auth/access.ts).
 *
 * Everything here is cross-tenant by nature, so callers pass `systemDb()`.
 */

export type AccessRequest = typeof accessRequests.$inferSelect;
export type AccessRequestStatus = AccessRequest["status"];

export type SubmitError = "invalid_email" | "missing_business" | "invalid_url" | "private_url" | "busy";

export type SubmitResult =
  | { ok: true; email: string; created: boolean }
  | { ok: false; error: SubmitError };

/** Ceiling on new requests per 24 hours, so a script cannot fill the table. */
export function accessRequestsPerDay(): number {
  const raw = Number(process.env.ACCESS_REQUESTS_PER_DAY);
  return Number.isInteger(raw) && raw > 0 ? raw : 1000;
}

const emailSchema = z.email().max(254);

/**
 * Record a request. Asking twice is harmless: the answer is the same whether
 * the address is new, waiting or already decided, so the form does not reveal
 * who has asked before. A second request never changes a decision; while one
 * is still waiting it only updates the business details.
 */
export async function submitAccessRequest(
  db: Db,
  input: { email: string; businessName: string; website: string; planInterest?: string; billingInterest?: string },
  options: { perDay?: number } = {},
): Promise<SubmitResult> {
  const email = emailSchema.safeParse(input.email.trim().toLowerCase());
  if (!email.success) return { ok: false, error: "invalid_email" };
  const businessName = input.businessName.trim().slice(0, 120);
  if (!businessName) return { ok: false, error: "missing_business" };

  let website: string;
  try {
    // Onboarding reads this site, so apply the crawler's own check now.
    website = parsePublicUrl(input.website.slice(0, 2_000)).toString();
  } catch (error) {
    if (!(error instanceof UnsafeUrlError)) throw error;
    const typo = error.reason === "invalid_url" || error.reason === "unsupported_scheme";
    return { ok: false, error: typo ? "invalid_url" : "private_url" };
  }

  // From a paid plan's button on the public page. Anything else is ignored.
  const planInterest: PaidPlan | null = isPaidPlan(input.planInterest) ? input.planInterest : null;
  const billingInterest: Billing | null = planInterest && isBilling(input.billingInterest) ? input.billingInterest : null;
  const interest = planInterest ? { planInterest, billingInterest } : {};

  const perDay = options.perDay ?? accessRequestsPerDay();
  return db.transaction(async (tx) => {
    // One at a time, so simultaneous requests cannot all slip under the ceiling.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('access_requests:submit'))`);
    const [existing] = await tx
      .select({ id: accessRequests.id, status: accessRequests.status })
      .from(accessRequests)
      .where(eq(accessRequests.email, email.data))
      .limit(1);
    if (existing) {
      if (existing.status === "pending") {
        await tx
          .update(accessRequests)
          .set({ businessName, website, ...interest })
          .where(eq(accessRequests.id, existing.id));
      } else if (planInterest) {
        // Interest in a plan is worth keeping even after a decision; the decision itself never changes here.
        await tx.update(accessRequests).set(interest).where(eq(accessRequests.id, existing.id));
      }
      return { ok: true, email: email.data, created: false } as const;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ recent }] = await tx
      .select({ recent: sql<number>`count(*)::int` })
      .from(accessRequests)
      .where(gte(accessRequests.createdAt, since));
    if (recent >= perDay) return { ok: false, error: "busy" } as const;

    await tx.insert(accessRequests).values({ email: email.data, businessName, website, ...interest });
    return { ok: true, email: email.data, created: true } as const;
  });
}

/** Newest first. */
export async function listAccessRequests(db: Db, status: AccessRequestStatus, limit = 200): Promise<AccessRequest[]> {
  return db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.status, status))
    .orderBy(desc(accessRequests.createdAt))
    .limit(limit);
}

export async function countPendingAccessRequests(db: Db): Promise<number> {
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"));
  return pending;
}

/**
 * Approve or reject. A decision can be changed later: rejecting an approved
 * address takes its access away on its next request.
 */
export async function decideAccessRequest(
  db: Db,
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
): Promise<AccessRequest | null> {
  const [row] = await db
    .update(accessRequests)
    .set({ status: decision, decidedAt: new Date(), decidedBy })
    .where(eq(accessRequests.id, id))
    .returning();
  return row ?? null;
}

/** Addresses in `ADMIN_EMAILS` may decide access requests. Full addresses only, no domains. */
export function parseAdmins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@") && !entry.startsWith("@"));
}

export function isAdmin(email: string, admins: string[] = parseAdmins(process.env.ADMIN_EMAILS)): boolean {
  return admins.includes(email.trim().toLowerCase());
}
