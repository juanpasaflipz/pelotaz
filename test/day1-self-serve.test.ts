import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessRequests, brands, contentItems, publications } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { AUTO_APPROVER, decideAccessRequest, selfServeFromEnv, submitAccessRequest } from "@/lib/access-requests";
import { isInvited } from "@/lib/auth/access";
import { cleanPermalink, markPublishedManually } from "@/lib/content/service";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

const rowFor = async (email: string) => {
  const [row] = await db.select().from(accessRequests).where(eq(accessRequests.email, email));
  return row;
};
// A pilot closed to everyone but the operator, as in production.
const closed = ["juan@pelotaz.test"];

describe("self-serve sign-up", () => {
  const ask = (email: string, selfServe?: { enabled: boolean; dailyCap: number }) =>
    submitAccessRequest(db, { email, businessName: "Tacos Ana", website: "tacosana.mx" }, { selfServe });

  it("keeps every request waiting when it is off, as before", async () => {
    expect(await ask("off@n.mx")).toMatchObject({ ok: true, created: true, approved: false });
    expect(await ask("off2@n.mx", { enabled: false, dailyCap: 50 })).toMatchObject({ approved: false });
    expect(await rowFor("off2@n.mx")).toMatchObject({ status: "pending", decidedBy: null });
    expect(await isInvited(db, "off2@n.mx", closed)).toBe(false);
  });

  it("lets a new request straight in, on record as automatic", async () => {
    const fresh = await createTestDb();
    try {
      const result = await submitAccessRequest(
        fresh.db,
        { email: "Nueva@Fonda.mx", businessName: "Fonda", website: "fonda.mx", source: "beta" },
        { selfServe: { enabled: true, dailyCap: 5 } },
      );
      expect(result).toEqual({ ok: true, email: "nueva@fonda.mx", created: true, approved: true });
      const [row] = await fresh.db.select().from(accessRequests);
      expect(row).toMatchObject({ status: "approved", decidedBy: AUTO_APPROVER, source: "beta" });
      expect(row.decidedAt).toBeInstanceOf(Date);
      expect(await isInvited(fresh.db, "nueva@fonda.mx", closed)).toBe(true);
    } finally {
      await fresh.close();
    }
  });

  it("stops at the daily cap, even when requests arrive together, and leaves the rest pending", async () => {
    const fresh = await createTestDb();
    try {
      const selfServe = { enabled: true, dailyCap: 2 };
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          submitAccessRequest(fresh.db, { email: `c${i}@n.mx`, businessName: "N", website: "n.mx" }, { selfServe }),
        ),
      );
      expect(results.filter((r) => r.ok && r.approved)).toHaveLength(2);
      const rows = await fresh.db.select().from(accessRequests);
      expect(rows.filter((r) => r.status === "approved")).toHaveLength(2);
      expect(rows.filter((r) => r.status === "pending")).toHaveLength(3);
    } finally {
      await fresh.close();
    }
  });

  it("does not count yesterday's or an admin's approvals against today", async () => {
    const fresh = await createTestDb();
    try {
      const selfServe = { enabled: true, dailyCap: 1 };
      const submit = (email: string) =>
        submitAccessRequest(fresh.db, { email, businessName: "N", website: "n.mx" }, { selfServe });
      await submit("ayer@n.mx");
      // Two days ago is yesterday or earlier in any time zone.
      await fresh.db
        .update(accessRequests)
        .set({ decidedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
        .where(eq(accessRequests.email, "ayer@n.mx"));
      await fresh.db.insert(accessRequests).values({
        email: "mano@n.mx",
        businessName: "N",
        website: "https://n.mx/",
        status: "approved",
        decidedAt: new Date(),
        decidedBy: "juan@pelotaz.test",
      });
      expect(await submit("hoy@n.mx")).toMatchObject({ approved: true });
      expect(await submit("tarde@n.mx")).toMatchObject({ approved: false });
    } finally {
      await fresh.close();
    }
  });

  it("never tells a second request whether the address was approved", async () => {
    const selfServe = { enabled: true, dailyCap: 50 };
    expect(await ask("repite@n.mx", selfServe)).toMatchObject({ approved: true });
    expect(await ask("repite@n.mx", selfServe)).toMatchObject({ created: false, approved: false });
  });

  it("lets an admin take automatic access away", async () => {
    await ask("fuera@n.mx", { enabled: true, dailyCap: 50 });
    const row = await rowFor("fuera@n.mx");
    await decideAccessRequest(db, row.id, "rejected", "juan@pelotaz.test");
    expect(await isInvited(db, "fuera@n.mx", closed)).toBe(false);
  });

  it("reads the switch and the cap from the environment", () => {
    const before = { ...process.env };
    try {
      delete process.env.SELF_SERVE_SIGNUP;
      delete process.env.SIGNUP_DAILY_CAP;
      expect(selfServeFromEnv()).toEqual({ enabled: false, dailyCap: 50 });
      process.env.SELF_SERVE_SIGNUP = " ON ";
      process.env.SIGNUP_DAILY_CAP = "7";
      expect(selfServeFromEnv()).toEqual({ enabled: true, dailyCap: 7 });
      process.env.SELF_SERVE_SIGNUP = "true";
      process.env.SIGNUP_DAILY_CAP = "muchos";
      expect(selfServeFromEnv()).toEqual({ enabled: false, dailyCap: 50 });
    } finally {
      process.env = before;
    }
  });
});

describe("published by hand", () => {
  let tenantId: string;
  let otherTenantId: string;
  let brandId: string;

  beforeAll(async () => {
    tenantId = await createTenant(db, "Copia y pega");
    otherTenantId = await createTenant(db, "Otro");
    brandId = await withTenant(db, tenantId, async (tx) => {
      const [row] = await tx.insert(brands).values({ tenantId, name: "La Brasa", sourceUrl: "https://x.example" }).returning();
      return row.id;
    });
  });

  const item = (status: (typeof contentItems.$inferInsert)["status"]) =>
    withTenant(db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(contentItems)
        .values({ tenantId, brandId, channel: "instagram", format: "post", status })
        .returning();
      return row.id;
    });
  const read = async (id: string) => {
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    return row;
  };

  it("marks an approved post as published, with the time and the owner's link", async () => {
    const id = await item("approved");
    const now = new Date("2026-11-21T18:30:00Z");
    expect(await markPublishedManually(db, tenantId, id, "instagram.com/p/abc", now)).toBe(true);
    expect(await read(id)).toMatchObject({
      status: "published",
      manualPublishedAt: now,
      manualPermalink: "https://instagram.com/p/abc",
    });
    // No publication row: those belong to a connected account, so the results job skips this post.
    expect(await db.select().from(publications).where(eq(publications.contentItemId, id))).toHaveLength(0);
  });

  it("works without a link", async () => {
    const id = await item("approved");
    expect(await markPublishedManually(db, tenantId, id)).toBe(true);
    expect(await read(id)).toMatchObject({ status: "published", manualPermalink: null });
  });

  it("refuses posts that are not approved, so a scheduled one cannot go out twice", async () => {
    for (const status of ["needs_approval", "scheduled", "publishing", "published", "rejected"] as const) {
      const id = await item(status);
      expect(await markPublishedManually(db, tenantId, id)).toBe(false);
      expect(await read(id)).toMatchObject({ status, manualPublishedAt: null });
    }
  });

  it("cannot mark another tenant's post", async () => {
    const id = await item("approved");
    expect(await markPublishedManually(db, otherTenantId, id)).toBe(false);
    expect(await read(id)).toMatchObject({ status: "approved", manualPublishedAt: null });
  });

  it("keeps only web links", () => {
    expect(cleanPermalink("  https://www.facebook.com/p/1 ")).toBe("https://www.facebook.com/p/1");
    expect(cleanPermalink("instagram.com/p/x")).toBe("https://instagram.com/p/x");
    expect(cleanPermalink("javascript:alert(1)")).toBeNull();
    expect(cleanPermalink("")).toBeNull();
    expect(cleanPermalink(undefined)).toBeNull();
  });
});
