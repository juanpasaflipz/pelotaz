import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessRequests, brands, contentItems, plans, tenants } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { submitAccessRequest } from "@/lib/access-requests";
import { resolveAccess, type Identity } from "@/lib/auth/access";
import { buildWelcomeEmail } from "@/lib/email/welcome";
import { funnelTotals, signupFunnel } from "@/lib/funnel";
import { createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

const open = { allowlist: [], allowUnverified: false };
const person = (email: string): Identity => ({
  userId: `user_${Math.random().toString(36).slice(2)}`,
  email,
  emailVerified: true,
  name: null,
});

describe("opening a workspace", () => {
  it("says so once, and records whose it is", async () => {
    const ana = person("Ana@Fonda.mx");
    const first = await resolveAccess(db, ana, open);
    expect(first).toMatchObject({ kind: "ok", created: true, email: "ana@fonda.mx" });
    const again = await resolveAccess(db, ana, open);
    expect(again.kind).toBe("ok");
    expect("created" in again).toBe(false);
    if (first.kind !== "ok") throw new Error("unreachable");
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, first.tenantId));
    expect(tenant.ownerEmail).toBe("ana@fonda.mx");
  });

  it("opens one workspace, and says so once, when two tabs arrive together", async () => {
    const leo = person("leo@fonda.mx");
    const results = await Promise.all([resolveAccess(db, leo, open), resolveAccess(db, leo, open)]);
    expect(results.filter((r) => r.kind === "ok" && r.created)).toHaveLength(1);
    expect(await db.select().from(tenants).where(eq(tenants.ownerEmail, "leo@fonda.mx"))).toHaveLength(1);
  });
});

describe("welcome email", () => {
  it("is in Spanish, links to the app, and is sent once per workspace", () => {
    const email = buildWelcomeEmail("ana@fonda.mx", "tenant-1", "https://www.pelotaz.com");
    expect(email.to).toBe("ana@fonda.mx");
    expect(email.subject).toContain("Pelotaz");
    expect(email.html).toContain('href="https://www.pelotaz.com"');
    expect(email.html).toContain("Abrir Pelotaz");
    expect(email.text).toContain("1. ");
    expect(email.text).toContain("https://www.pelotaz.com");
    expect(email.idempotencyKey).toBe("welcome:tenant-1");
  });

  it("escapes the address it links to", () => {
    const email = buildWelcomeEmail("a@b.mx", "t", 'https://x.mx/?a=1&b="2"');
    expect(email.html).toContain("https://x.mx/?a=1&amp;b=&quot;2&quot;");
  });
});

describe("sign-up funnel", () => {
  it("counts each origin from request to first published post", async () => {
    const fresh = await createTestDb();
    try {
      const d = fresh.db;
      const selfServe = { enabled: true, dailyCap: 2 };
      const ask = (email: string, source?: string, utm?: unknown) =>
        submitAccessRequest(d, { email, businessName: "N", website: "n.mx", source, utm }, { selfServe });
      await ask("uno@n.mx", "beta");
      await ask("dos@n.mx", "beta");
      await ask("tres@n.mx", "beta"); // past the cap: pending
      await ask("ads@n.mx", "empieza", { utm_source: "facebook" });
      await ask("root@n.mx");

      // uno goes all the way; dos opens a workspace and stops.
      const uno = await resolveAccess(d, person("uno@n.mx"), { allowlist: ["x@x.mx"], allowUnverified: false });
      const dos = await resolveAccess(d, person("dos@n.mx"), { allowlist: ["x@x.mx"], allowUnverified: false });
      if (uno.kind !== "ok" || dos.kind !== "ok") throw new Error("expected both to be let in");
      await withTenant(d, uno.tenantId, async (tx) => {
        const [brand] = await tx
          .insert(brands)
          .values({ tenantId: uno.tenantId, name: "Uno", sourceUrl: "https://n.mx", status: "ready" })
          .returning();
        const [plan] = await tx
          .insert(plans)
          .values({ tenantId: uno.tenantId, brandId: brand.id, weekStart: "2026-11-23" })
          .returning();
        await tx.insert(contentItems).values({
          tenantId: uno.tenantId,
          brandId: brand.id,
          planId: plan.id,
          channel: "instagram",
          format: "post",
          status: "published",
        });
      });

      const rows = await signupFunnel(d, 7);
      const beta = rows.find((row) => row.origin === "beta");
      expect(beta).toEqual({
        origin: "beta",
        requests: 3,
        approved: 2,
        automatic: 2,
        accounts: 2,
        profiles: 1,
        plans: 1,
        approvedPost: 1,
        publishedPost: 1,
      });
      expect(rows.find((row) => row.origin === "empieza · facebook")).toMatchObject({ requests: 1, accounts: 0 });
      expect(rows.find((row) => row.origin === "directo")).toMatchObject({ requests: 1, approved: 0 });
      expect(funnelTotals(rows)).toMatchObject({ requests: 5, approved: 2, accounts: 2, publishedPost: 1 });

      // Older than the window: gone from the count.
      await d
        .update(accessRequests)
        .set({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) })
        .where(eq(accessRequests.email, "root@n.mx"));
      expect((await signupFunnel(d, 7)).find((row) => row.origin === "directo")).toBeUndefined();
      expect((await signupFunnel(d, 30)).find((row) => row.origin === "directo")).toBeDefined();
    } finally {
      await fresh.close();
    }
  });
});
