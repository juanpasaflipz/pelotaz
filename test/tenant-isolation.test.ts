import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands, creditLedger, tenants } from "@/db/schema";
import { InvalidTenantIdError, withTenant, type Db } from "@/db/tenant";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;
let tenantA: string;
let tenantB: string;
let brandA: string;

/** Drizzle wraps driver errors; the Postgres message is on the cause chain. */
async function pgError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
    return messages.join(" | ");
  }
  throw new Error("Expected the statement to be rejected, but it succeeded");
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  tenantA = await createTenant(db, "Tenant A");
  tenantB = await createTenant(db, "Tenant B");
  brandA = await withTenant(db, tenantA, async (tx) => {
    const [row] = await tx
      .insert(brands)
      .values({ tenantId: tenantA, name: "Brand A", sourceUrl: "https://a.example" })
      .returning();
    return row.id;
  });
});

afterAll(async () => {
  await close();
});

describe("row-level security", () => {
  it("lets a tenant read its own rows", async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(brands));
    expect(rows.map((r) => r.id)).toEqual([brandA]);
  });

  it("hides another tenant's rows from an unfiltered query", async () => {
    const rows = await withTenant(db, tenantB, (tx) => tx.select().from(brands));
    expect(rows).toEqual([]);
  });

  it("hides another tenant's row even when queried by id", async () => {
    const rows = await withTenant(db, tenantB, (tx) =>
      tx.select().from(brands).where(eq(brands.id, brandA)),
    );
    expect(rows).toEqual([]);
  });

  it("makes updates and deletes of another tenant's row affect nothing", async () => {
    await withTenant(db, tenantB, async (tx) => {
      const updated = await tx
        .update(brands)
        .set({ name: "hijacked" })
        .where(eq(brands.id, brandA))
        .returning();
      const deleted = await tx.delete(brands).where(eq(brands.id, brandA)).returning();
      expect(updated).toEqual([]);
      expect(deleted).toEqual([]);
    });
    const [row] = await db.select().from(brands).where(eq(brands.id, brandA));
    expect(row.name).toBe("Brand A");
  });

  it("rejects inserting a row labelled with another tenant", async () => {
    const message = await pgError(() =>
      withTenant(db, tenantB, (tx) =>
        tx.insert(brands).values({ tenantId: tenantA, name: "planted", sourceUrl: "https://x.example" }),
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("rejects moving a row to another tenant", async () => {
    const message = await pgError(() =>
      withTenant(db, tenantA, (tx) =>
        tx.update(brands).set({ tenantId: tenantB }).where(eq(brands.id, brandA)),
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("returns nothing to the tenant role when no tenant is set", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_tenant`);
      return tx.select().from(brands);
    });
    expect(rows).toEqual([]);
  });

  it("drops the tenant role when the transaction ends", async () => {
    await withTenant(db, tenantA, (tx) => tx.select().from(brands));
    const result = (await db.execute(sql`select current_user as role`)) as unknown as {
      rows: Array<{ role: string }>;
    };
    expect(result.rows[0].role).not.toBe("app_tenant");
    const all = await db.select().from(tenants);
    expect(all.length).toBe(2);
  });

  it("refuses a tenant id that is not a UUID", async () => {
    await expect(
      withTenant(db, "1; drop table brands", (tx) => tx.select().from(brands)),
    ).rejects.toBeInstanceOf(InvalidTenantIdError);
  });
});

describe("tenant account row", () => {
  it("shows a tenant only its own account", async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(tenants));
    expect(rows.map((r) => r.id)).toEqual([tenantA]);
  });

  it("does not let tenant code change plan or balance", async () => {
    const message = await pgError(() =>
      withTenant(db, tenantA, (tx) =>
        tx.update(tenants).set({ creditBalance: 1_000_000 }).where(eq(tenants.id, tenantA)),
      ),
    );
    expect(message).toMatch(/permission denied/i);
  });
});

describe("credit ledger", () => {
  const balanceOf = async (tenantId: string) => {
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    return row.creditBalance;
  };

  it("keeps the cached balance equal to the ledger sum", async () => {
    await withTenant(db, tenantA, async (tx) => {
      await tx.insert(creditLedger).values({ tenantId: tenantA, kind: "grant_monthly", amount: 100 });
      await tx.insert(creditLedger).values({ tenantId: tenantA, kind: "debit", amount: -30 });
    });
    expect(await balanceOf(tenantA)).toBe(70);
    expect(await balanceOf(tenantB)).toBe(0);
  });

  it("aborts the whole transaction when a debit would overdraw", async () => {
    const message = await pgError(() =>
      withTenant(db, tenantA, async (tx) => {
        await tx
          .insert(brands)
          .values({ tenantId: tenantA, name: "paid work", sourceUrl: "https://paid.example" });
        await tx.insert(creditLedger).values({ tenantId: tenantA, kind: "debit", amount: -71 });
      }),
    );
    expect(message).toMatch(/tenants_credit_balance_nonnegative/);
    expect(await balanceOf(tenantA)).toBe(70);
    const rows = await db.select().from(brands).where(eq(brands.name, "paid work"));
    expect(rows).toEqual([]);
  });

  it("is append-only for tenant code", async () => {
    const update = await pgError(() =>
      withTenant(db, tenantA, (tx) => tx.update(creditLedger).set({ amount: 999 })),
    );
    const remove = await pgError(() =>
      withTenant(db, tenantA, (tx) => tx.delete(creditLedger)),
    );
    expect(update).toMatch(/permission denied/i);
    expect(remove).toMatch(/permission denied/i);
  });

  it("rejects a ledger row for another tenant", async () => {
    const message = await pgError(() =>
      withTenant(db, tenantB, (tx) =>
        tx.insert(creditLedger).values({ tenantId: tenantA, kind: "topup", amount: 500 }),
      ),
    );
    expect(message).toMatch(/row-level security/i);
    expect(await balanceOf(tenantA)).toBe(70);
  });

  it("applies a replayed idempotency key once", async () => {
    const grant = { tenantId: tenantB, kind: "topup" as const, amount: 50, idempotencyKey: "evt_1" };
    await withTenant(db, tenantB, (tx) => tx.insert(creditLedger).values(grant));
    const message = await pgError(() =>
      withTenant(db, tenantB, (tx) => tx.insert(creditLedger).values(grant)),
    );
    expect(message).toMatch(/credit_ledger_idempotency/);
    expect(await balanceOf(tenantB)).toBe(50);
  });
});
